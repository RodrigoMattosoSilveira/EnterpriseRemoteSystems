package authentication

import (
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"github.com/gofiber/fiber/v3"
)

const (
	sessionLocalKey      = "ers.authentication.session"
	sessionErrorLocalKey = "ers.authentication.error"
)

type CookieConfig struct {
	Name     string
	Secure   bool
	SameSite string
	TTL      time.Duration
}

type Handler struct {
	service           Service
	cookie            CookieConfig
	actorStore        authz.ActorStore
	auditStore        authz.AuditLogStore
	tenantOptionStore authz.TenantOptionStore
}

func NewHandler(service Service, cookie CookieConfig, actorStore authz.ActorStore, auditStore authz.AuditLogStore) *Handler {
	if strings.TrimSpace(cookie.Name) == "" {
		cookie.Name = "ers_session"
	}
	if strings.TrimSpace(cookie.SameSite) == "" {
		cookie.SameSite = "Lax"
	}
	if cookie.TTL <= 0 {
		cookie.TTL = defaultSessionTTL
	}
	handler := &Handler{service: service, cookie: cookie, actorStore: actorStore, auditStore: auditStore}
	if store, ok := actorStore.(authz.TenantOptionStore); ok {
		handler.tenantOptionStore = store
	}
	return handler
}

func (h *Handler) SessionMiddleware() fiber.Handler {
	return func(c fiber.Ctx) error {
		rawToken := h.readCookie(c)
		if rawToken == "" {
			return c.Next()
		}
		session, err := h.service.ResolveSession(c.Context(), rawToken)
		if err != nil {
			c.Locals(sessionErrorLocalKey, err)
			return c.Next()
		}
		SetSessionContext(c, session)
		return c.Next()
	}
}

func (h *Handler) RequireSession(c fiber.Ctx) error {
	_, err := h.currentSession(c)
	if err != nil {
		return h.writeError(c, err)
	}
	return c.Next()
}

func (h *Handler) Login(c fiber.Ctx) error {
	var req LoginRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	result, err := h.service.Login(c.Context(), req, c.Get("User-Agent"), c.IP())
	if err != nil {
		return h.writeError(c, err)
	}
	h.setSessionCookie(c, result.Token, result.Session.ExpiresAt)
	setNoStore(c)
	return httpx.OK(c, result.Session)
}

func (h *Handler) Logout(c fiber.Ctx) error {
	if err := h.service.Logout(c.Context(), h.readCookie(c)); err != nil {
		return h.writeError(c, err)
	}
	h.clearSessionCookie(c)
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) CurrentSession(c fiber.Ctx) error {
	session, err := h.currentSession(c)
	if err != nil {
		return h.writeError(c, err)
	}
	setNoStore(c)
	return httpx.OK(c, session)
}

func (h *Handler) TenantOptions(c fiber.Ctx) error {
	session, err := h.currentSession(c)
	if err != nil {
		return h.writeError(c, err)
	}
	if accountActorStore, ok := h.actorStore.(authz.AccountActorStore); ok {
		options, err := accountActorStore.ListAccountTenantOptions(c.Context(), session.AccountID)
		if err == nil {
			setNoStore(c)
			return httpx.OK(c, options)
		}
		if !errors.Is(err, authz.ErrAccountActorFoundationUnavailable) {
			return h.writeError(c, err)
		}
	}
	if h.tenantOptionStore == nil {
		return httpx.WriteError(c, errors.New("tenant options are unavailable"))
	}
	options, err := h.tenantOptionStore.ListActorTenantOptions(c.Context(), session.ActorID)
	if err != nil {
		return h.writeError(c, err)
	}
	setNoStore(c)
	return httpx.OK(c, options)
}

func (h *Handler) ChangePassword(c fiber.Ctx) error {
	if _, err := h.currentSession(c); err != nil {
		return h.writeError(c, err)
	}
	var req ChangePasswordRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	if err := h.service.ChangePassword(c.Context(), h.readCookie(c), req); err != nil {
		return h.writeError(c, err)
	}
	h.clearSessionCookie(c)
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) ResetPassword(c fiber.Ctx) error {
	var req ResetPasswordRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	result, err := h.service.ResetPassword(c.Context(), req)
	if err != nil {
		return h.writeError(c, err)
	}
	h.clearSessionCookie(c)
	setNoStore(c)
	return httpx.OK(c, result)
}

func (h *Handler) ListAccounts(c fiber.Ctx) error {
	accounts, err := h.service.ListAccounts(c.Context())
	if err != nil {
		return h.writeError(c, err)
	}
	return httpx.OK(c, accounts)
}

func (h *Handler) CreateAccount(c fiber.Ctx) error {
	var req CreateAccountRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	req.TenantID = strings.TrimSpace(c.Get(authz.HeaderTenantID))
	account, err := h.service.CreateAccount(c.Context(), req)
	if err != nil {
		return h.writeError(c, err)
	}
	h.recordAdminAudit(c, "authentication.accounts.create", account.ID)
	return httpx.Created(c, account)
}

func (h *Handler) SetAccountActive(c fiber.Ctx) error {
	var req SetAccountActiveRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	if req.Active == nil {
		return httpx.BadRequest(c, "validation_failed", "Active state is required")
	}
	if !*req.Active {
		requestActor, err := authz.ResolveRequestActor(c, h.actorStore)
		if err == nil && requestActor.RecordID != "" {
			target, findErr := h.service.GetAccount(c.Context(), c.Params("id"))
			if findErr != nil {
				return h.writeError(c, findErr)
			}
			ownsRequestActor := target.ActorID == requestActor.RecordID
			for _, actor := range target.Actors {
				if actor.ActorID == requestActor.RecordID {
					ownsRequestActor = true
					break
				}
			}
			if ownsRequestActor {
				return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{
					Code:    "self_deactivation_forbidden",
					Message: "An administrator cannot deactivate their own authentication account",
				}})
			}
		}
	}
	account, err := h.service.SetAccountActive(c.Context(), c.Params("id"), *req.Active)
	if err != nil {
		return h.writeError(c, err)
	}
	operation := "authentication.accounts.activate"
	if !*req.Active {
		operation = "authentication.accounts.deactivate"
	}
	h.recordAdminAudit(c, operation, account.ID)
	return httpx.OK(c, account)
}

func (h *Handler) IssuePasswordResetToken(c fiber.Ctx) error {
	result, err := h.service.IssuePasswordResetToken(c.Context(), c.Params("id"))
	if err != nil {
		return h.writeError(c, err)
	}
	h.recordAdminAudit(c, "authentication.password_reset_tokens.issue", c.Params("id"))
	setNoStore(c)
	return httpx.Created(c, result)
}

func (h *Handler) recordAdminAudit(c fiber.Ctx, operation string, targetID string) {
	if h.auditStore == nil {
		return
	}
	actor, err := authz.ResolveRequestActor(c, h.actorStore)
	if err != nil && !errors.Is(err, authz.ErrMissingActor) {
		return
	}
	_ = h.auditStore.RecordAuthorizationAudit(c.Context(), authz.AuthorizationAuditEntry{
		Actor:           actor,
		FallbackActorID: strings.TrimSpace(c.Get(authz.HeaderActorID)),
		TenantID:        strings.TrimSpace(c.Get(authz.HeaderTenantID)),
		Permission:      authz.PermissionAuthzManage,
		Operation:       operation,
		TargetType:      "auth_user_account",
		TargetID:        strings.TrimSpace(targetID),
		Decision:        authz.AuditDecisionAuthorized,
		RequestMethod:   c.Method(),
		RequestPath:     c.Path(),
	})
}

// SetSessionContext stores an already verified session for downstream
// authorization middleware. It is exported so route integration tests can
// model the same request boundary without manufacturing raw session cookies.
func SetSessionContext(c fiber.Ctx, session SessionResponse) {
	c.Locals(sessionLocalKey, session)
	c.Locals(sessionErrorLocalKey, nil)
}

func SessionFromContext(c fiber.Ctx) (SessionResponse, bool) {
	value := c.Locals(sessionLocalKey)
	session, ok := value.(SessionResponse)
	return session, ok
}

func SessionErrorFromContext(c fiber.Ctx) error {
	value := c.Locals(sessionErrorLocalKey)
	err, _ := value.(error)
	return err
}

func (h *Handler) currentSession(c fiber.Ctx) (SessionResponse, error) {
	if err := SessionErrorFromContext(c); err != nil {
		return SessionResponse{}, err
	}
	if session, ok := SessionFromContext(c); ok {
		return session, nil
	}
	session, err := h.service.ResolveSession(c.Context(), h.readCookie(c))
	if err != nil {
		c.Locals(sessionErrorLocalKey, err)
		return SessionResponse{}, err
	}
	SetSessionContext(c, session)
	return session, nil
}

func (h *Handler) readCookie(c fiber.Ctx) string {
	return strings.TrimSpace(c.Cookies(h.cookie.Name))
}

func (h *Handler) setSessionCookie(c fiber.Ctx, token string, expiresAt time.Time) {
	c.Cookie(&fiber.Cookie{
		Name:     h.cookie.Name,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		MaxAge:   int(h.cookie.TTL.Seconds()),
		Secure:   h.cookie.Secure,
		HTTPOnly: true,
		SameSite: h.cookie.SameSite,
	})
}

func (h *Handler) clearSessionCookie(c fiber.Ctx) {
	c.Cookie(&fiber.Cookie{
		Name:     h.cookie.Name,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(1, 0).UTC(),
		MaxAge:   -1,
		Secure:   h.cookie.Secure,
		HTTPOnly: true,
		SameSite: h.cookie.SameSite,
	})
}

func setNoStore(c fiber.Ctx) {
	c.Set(fiber.HeaderCacheControl, "no-store")
	c.Set("Pragma", "no-cache")
}

// WriteSessionError exposes the canonical authentication error response to the
// Bite 28C business-route middleware. Invalid session cookies are rejected
// before authorization and receive the same cookie-clearing behavior as the
// authentication endpoints.
func (h *Handler) WriteSessionError(c fiber.Ctx, err error) error {
	return h.writeError(c, err)
}

func (h *Handler) writeError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, ErrInvalidCredentials):
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "invalid_credentials", Message: "Login or password is invalid"}})
	case errors.Is(err, ErrAuthenticationRequired):
		setNoStore(c)
		h.clearSessionCookie(c)
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "authentication_required", Message: "An authenticated session is required"}})
	case errors.Is(err, ErrSessionExpired):
		setNoStore(c)
		h.clearSessionCookie(c)
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "session_expired", Message: "The authenticated session has expired"}})
	case errors.Is(err, ErrAccountInactive):
		setNoStore(c)
		h.clearSessionCookie(c)
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "account_inactive", Message: "The authentication account is inactive"}})
	case errors.Is(err, ErrActorInactive):
		setNoStore(c)
		h.clearSessionCookie(c)
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "actor_inactive", Message: "The authorization actor is inactive"}})
	case errors.Is(err, ErrLoginAlreadyExists):
		return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "login_exists", Message: "An authentication account already uses this login"}})
	case errors.Is(err, ErrActorAlreadyLinked):
		return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "actor_account_exists", Message: "This authorization actor already has an authentication account"}})
	case errors.Is(err, ErrResetTokenInvalid), errors.Is(err, ErrResetTokenExpired):
		return c.Status(fiber.StatusBadRequest).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "invalid_reset_token", Message: "The password reset token is invalid or expired"}})
	default:
		return httpx.WriteError(c, err)
	}
}
