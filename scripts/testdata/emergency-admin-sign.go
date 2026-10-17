// Command emergency-admin-sign creates synthetic Ed25519 test approvals only.
// It is not used by the Production emergency recovery process.
package main

import (
    "crypto/ed25519"
    "crypto/rand"
    "crypto/x509"
    "bytes"
    "encoding/pem"
    "fmt"
    "os"
    "path/filepath"
)

func verify() error {
    if len(os.Args) != 5 {
        return fmt.Errorf("usage: emergency-admin-sign verify REQUEST PUBLIC_KEY SIGNATURE")
    }
    message, err := os.ReadFile(os.Args[2]); if err != nil { return err }
    publicPEM, err := os.ReadFile(os.Args[3]); if err != nil { return err }
    block, rest := pem.Decode(publicPEM)
    if block == nil || block.Type != "PUBLIC KEY" || len(bytes.TrimSpace(rest)) != 0 {
        return fmt.Errorf("invalid PEM public key")
    }
    parsed, err := x509.ParsePKIXPublicKey(block.Bytes); if err != nil { return err }
    public, ok := parsed.(ed25519.PublicKey)
    if !ok { return fmt.Errorf("expected Ed25519 public key") }
    signature, err := os.ReadFile(os.Args[4]); if err != nil { return err }
    if !ed25519.Verify(public, message, signature) {
        return fmt.Errorf("Ed25519 signature verification failed")
    }
    return nil
}

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
    var err error
    if len(os.Args)>1 && os.Args[1]=="verify" { err=verify() } else { err=run() }
    if err != nil {
        fmt.Fprintln(os.Stderr, err)
        os.Exit(1)
    }
}
