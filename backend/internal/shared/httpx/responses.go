package httpx

import (
	"github.com/gofiber/fiber/v3"
	"enterpriseremotesystems/backend/internal/shared/dto"
)

func OK[T any](c fiber.Ctx, data T) error {
	return c.Status(fiber.StatusOK).JSON(dto.APIResponse[T]{Data: data})
}
func Created[T any](c fiber.Ctx, data T) error {
	return c.Status(fiber.StatusCreated).JSON(dto.APIResponse[T]{Data: data})
}
func BadRequest(c fiber.Ctx, code, message string) error {
	return c.Status(fiber.StatusBadRequest).JSON(dto.APIResponse[any]{Error: &dto.APIError{Code: code, Message: message}})
}
func NotFound(c fiber.Ctx, message string) error {
	return c.Status(fiber.StatusNotFound).JSON(dto.APIResponse[any]{Error: &dto.APIError{Code: "not_found", Message: message}})
}
func ServerError(c fiber.Ctx, err error) error {
	return c.Status(fiber.StatusInternalServerError).JSON(dto.APIResponse[any]{Error: &dto.APIError{Code: "internal_error", Message: err.Error()}})
}
