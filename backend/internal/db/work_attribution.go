package db

// WorkAttribution captures the work actually performed when an accrual is calculated.
// Both IDs and human-readable labels are snapshots, not mutable reference-data joins.
// Empty attribution means no actual work was recorded (or a legacy record predating
// this snapshot). It must not be presented as a performed assignment.
type WorkAttribution struct {
	WorkSectorID      string `gorm:"type:text;not null;default:''" json:"workSectorId,omitempty"`
	WorkSectorLabel   string `gorm:"type:text;not null;default:''" json:"workSectorLabel,omitempty"`
	WorkLocationID    string `gorm:"type:text;not null;default:''" json:"workLocationId,omitempty"`
	WorkLocationLabel string `gorm:"type:text;not null;default:''" json:"workLocationLabel,omitempty"`
	WorkTaskID        string `gorm:"type:text;not null;default:''" json:"workTaskId,omitempty"`
	WorkTaskLabel     string `gorm:"type:text;not null;default:''" json:"workTaskLabel,omitempty"`
}
