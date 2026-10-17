// Command emergency-admin-sign creates synthetic Ed25519 test approvals only.
// It is not used by the Production emergency recovery process.
package main

import (
    "crypto/ed25519"
    "crypto/rand"
    "crypto/x509"
    "encoding/pem"
    "fmt"
    "os"
    "path/filepath"
)

func run() error {
    if len(os.Args) != 4 {
        return fmt.Errorf("usage: emergency-admin-sign REQUEST TRUST_DIR SIGNATURE_DIR")
    }
    request, err := os.ReadFile(os.Args[1])
    if err != nil { return err }
    for _, owner := range []string{"owner-a", "owner-b"} {
        public, private, err := ed25519.GenerateKey(rand.Reader)
        if err != nil { return err }
        der, err := x509.MarshalPKIXPublicKey(public)
        if err != nil { return err }
        pemBytes := pem.EncodeToMemory(&pem.Block{Type:"PUBLIC KEY", Bytes:der})
        if err := os.WriteFile(filepath.Join(os.Args[2], owner+".pem"), pemBytes, 0600); err != nil { return err }
        if err := os.WriteFile(filepath.Join(os.Args[3], owner+".sig"), ed25519.Sign(private, request), 0600); err != nil { return err }
    }
    return nil
}

func main() {
    if err := run(); err != nil {
        fmt.Fprintln(os.Stderr, err)
        os.Exit(1)
    }
}
