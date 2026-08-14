package authentication

import "gorm.io/gorm"

func AutoMigrate(database *gorm.DB) error {
	return database.AutoMigrate(&Account{}, &AccountPerson{}, &AccountActor{}, &Session{}, &PasswordResetToken{})
}
