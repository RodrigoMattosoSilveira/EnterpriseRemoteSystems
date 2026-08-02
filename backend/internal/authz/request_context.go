package authz

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"
)

const (
	requestActorLocalKey      = "ers.authz.request_actor"
	requestActorErrorLocalKey = "ers.authz.request_actor_error"
)

// SetRequestActor stores the authoritative actor resolved by the route
// middleware. Handler-level authorization must reuse this actor rather than
// reading identity headers again.
func SetRequestActor(c fiber.Ctx, actor *Actor) {
	c.Locals(requestActorLocalKey, actor)
	c.Locals(requestActorErrorLocalKey, nil)
}

// SetRequestActorError stores the authoritative actor-resolution failure. This
// prevents handler-level fallbacks from accepting actor headers after an
// invalid or missing authenticated session has already been resolved.
func SetRequestActorError(c fiber.Ctx, err error) {
	c.Locals(requestActorLocalKey, nil)
	c.Locals(requestActorErrorLocalKey, err)
}

// RequestActorFromContext returns the actor or actor-resolution error already
// established for the request by authorization middleware.
func RequestActorFromContext(c fiber.Ctx) (*Actor, error) {
	if value := c.Locals(requestActorErrorLocalKey); value != nil {
		if err, ok := value.(error); ok && err != nil {
			return nil, err
		}
	}

	actor, ok := c.Locals(requestActorLocalKey).(*Actor)
	if !ok || actor == nil || strings.TrimSpace(actor.ID) == "" {
		return nil, ErrMissingActor
	}
	return actor, nil
}

// RequestActorID returns the external actor key established by the route
// middleware. The fallback is retained only for isolated handler tests and
// compatibility call sites that execute without request-actor middleware. A
// stored authentication or authorization failure never falls back to a
// caller-supplied value.
func RequestActorID(c fiber.Ctx, fallback string) string {
	actor, err := RequestActorFromContext(c)
	if err == nil {
		return strings.TrimSpace(actor.ID)
	}
	if !errors.Is(err, ErrMissingActor) {
		return ""
	}
	return strings.TrimSpace(fallback)
}

// ResolveRequestActor reuses the middleware-resolved actor when available. The
// header fallback exists only for isolated handler tests and compatibility
// call sites that intentionally execute without the normal route middleware.
// A stored authentication or authorization error is always authoritative.
func ResolveRequestActor(c fiber.Ctx, store ActorStore) (*Actor, error) {
	actor, err := RequestActorFromContext(c)
	if err == nil {
		return actor, nil
	}
	if !errors.Is(err, ErrMissingActor) {
		return nil, err
	}

	actor, err = ResolveActor(c.Context(), store, func(name string) string {
		return c.Get(name)
	})
	if err != nil {
		return nil, err
	}
	SetRequestActor(c, actor)
	return actor, nil
}
