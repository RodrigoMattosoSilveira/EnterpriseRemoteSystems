// Package fielderrors collects field validation failures together with a
// stable, locale-independent rule code per field.
//
// The English message stays the API's human-readable text (and log text);
// clients translate the rule code. Packages keep their own ValidationError
// type and expose the codes through ValidationFieldCodes(), which
// httpx.WriteError returns as `fieldCodes`.
package fielderrors

import "strings"

// Rule codes shared by several modules. Module-specific codes live next to the
// validation that produces them. Renaming any code is an API change.
const (
	Required       = "required"
	InvalidDate    = "invalid_date"
	MustBePositive = "must_be_positive"
)

// Collector accumulates field messages and their rule codes.
type Collector struct {
	Fields map[string]string
	Codes  map[string]string
}

func New() *Collector {
	return &Collector{Fields: map[string]string{}, Codes: map[string]string{}}
}

// Add records (or replaces) the failure for a field.
func (c *Collector) Add(field string, rule string, message string) {
	c.Fields[field] = message
	c.Codes[field] = rule
}

// Require records a Required failure when value is blank after trimming.
func (c *Collector) Require(field string, value string) {
	if strings.TrimSpace(value) == "" {
		c.Add(field, Required, "Required")
	}
}

func (c *Collector) Empty() bool { return len(c.Fields) == 0 }

// Single returns the maps for exactly one field failure.
func Single(field string, rule string, message string) (map[string]string, map[string]string) {
	return map[string]string{field: message}, map[string]string{field: rule}
}
