// Byte 35.4C: read a password on stdin and output a bcrypt hash.
// Use with Python getpass so plaintext is never entered in shell history.
package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && len(line) == 0 {
		fmt.Fprintln(os.Stderr, "STOP: could not read a password on stdin")
		os.Exit(1)
	}
	password := strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
	if len(password) < 16 || len(password) > 72 {
		fmt.Fprintln(os.Stderr, "STOP: use a strong 16–72-byte password")
		os.Exit(1)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		fmt.Fprintln(os.Stderr, "STOP: could not generate bcrypt hash")
		os.Exit(1)
	}
	fmt.Println(string(hash))
}
