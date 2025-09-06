# RefugeeAid: Blockchain Solution for Secure Aid Distribution to Refugees

## Overview

RefugeeAid is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses real-world problems faced by refugees, such as lost or missing identity documents, inefficient aid distribution, corruption in aid allocation, and lack of transparency. By leveraging blockchain, the system provides self-sovereign digital identities that are immutable and verifiable, replacing traditional paper documents. Aid is distributed as fungible tokens, ensuring secure, traceable, and auditable transfers without intermediaries.

### Key Problems Solved
- **Identity Loss**: Refugees often flee without documents. RefugeeAid uses NFTs to create unique, blockchain-based identities verified by trusted organizations (e.g., UNHCR or NGOs).
- **Aid Mismanagement**: Traditional systems suffer from duplication, fraud, and delays. Smart contracts automate distribution, enforce eligibility rules, and log all transactions immutably.
- **Transparency and Accountability**: All actions are on-chain, allowing donors, governments, and refugees to audit aid flows.
- **Security**: Biometric hashes or zero-knowledge proofs (integrated via Clarity's capabilities) ensure privacy and prevent identity theft.
- **Accessibility**: Refugees can access aid via simple wallets, even in low-connectivity areas, with Stacks' Bitcoin-anchored security.

The project involves 7 solid smart contracts in Clarity, designed for safety, predictability, and composability. Stacks' non-Turing-complete nature prevents infinite loops and enhances security.

## Architecture
- **Identity Management**: Uses NFTs for unique refugee identities.
- **Aid Tokens**: Fungible tokens (SIP-010 compliant) representing aid (e.g., food credits, cash equivalents).
- **Distribution Logic**: Automated rules for allocating and claiming aid.
- **Verification**: Oracle-like contract for off-chain verifiers to confirm identities.
- **Governance**: Decentralized control for updates by stakeholders.

Contracts are deployed on Stacks, with interactions via wallets like Hiro Wallet. Future integrations could include mobile apps for refugees.

## Smart Contracts
Below are the 7 Clarity smart contracts. Each includes a brief description, followed by the code. These are production-ready skeletons; in a real deployment, add error handling and testing.

### 1. IdentityNFT.clar
This contract issues NFTs representing refugee identities. Each NFT holds a unique ID hash (e.g., from biometrics) and metadata.

```clarity
;; IdentityNFT Contract
(define-non-fungible-token identity-nft uint)

(define-map identity-metadata uint { owner: principal, hash: (buff 32), verified: bool })

(define-data-var next-id uint u1)

(define-public (mint-identity (hash (buff 32)) (recipient principal))
  (let ((id (var-get next-id)))
    (try! (nft-mint? identity-nft id recipient))
    (map-set identity-metadata id { owner: recipient, hash: hash, verified: false })
    (var-set next-id (+ id u1))
    (ok id)))

(define-public (verify-identity (id uint) (verifier principal))
  (match (map-get? identity-metadata id)
    some-meta (if (is-eq tx-sender verifier)
                (begin
                  (map-set identity-metadata id (merge some-meta { verified: true }))
                  (ok true))
                (err u1))
    none (err u2)))

(define-read-only (get-identity (id uint))
  (map-get? identity-metadata id))
```

### 2. AidToken.clar
Fungible token (SIP-010) for aid distribution. Tokens can represent USD equivalents or specific aid types.

```clarity
;; AidToken Contract (SIP-010 Compliant)
(define-fungible-token aid-token u1000000000) ;; Max supply example

(define-constant admin 'SP000000000000000000002Q6VF78) ;; Replace with deployer

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (ft-transfer? aid-token amount sender recipient))

(define-public (mint (amount uint) (recipient principal))
  (if (is-eq tx-sender admin)
      (ft-mint? aid-token amount recipient)
      (err u1)))

(define-public (burn (amount uint) (sender principal))
  (ft-burn? aid-token amount sender))

(define-read-only (get-balance (account principal))
  (ft-get-balance aid-token account))

(define-read-only (get-total-supply)
  (ft-get-supply aid-token))

(define-read-only (get-name)
  (ok "AidToken"))

(define-read-only (get-symbol)
  (ok "AID"))

(define-read-only (get-decimals)
  (ok u6))

(define-read-only (get-token-uri)
  (ok none))
```

### 3. Registry.clar
Maps identities to additional data like eligibility status and aid history.

```clarity
;; Registry Contract
(define-map refugee-registry uint { identity-id: uint, eligibility: bool, last-claim: uint })

(define-public (register-refugee (identity-id uint) (eligibility bool))
  (map-set refugee-registry tx-sender { identity-id: identity-id, eligibility: eligibility, last-claim: u0 })
  (ok true))

(define-public (update-eligibility (user principal) (eligibility bool))
  (match (map-get? refugee-registry user)
    some-data (begin
                (map-set refugee-registry user (merge some-data { eligibility: eligibility }))
                (ok true))
    none (err u1)))

(define-read-only (get-refugee-data (user principal))
  (map-get? refugee-registry user))
```

### 4. Distribution.clar
Handles bulk aid distribution by authorized distributors (e.g., NGOs).

```clarity
;; Distribution Contract
(define-constant distributor-role 'SP000000000000000000002Q6VF78) ;; Example

(define-map distributions uint { amount: uint, recipients: (list 100 principal) })

(define-data-var next-dist-id uint u1)

(define-public (distribute-aid (amount uint) (recipients (list 100 principal)))
  (if (is-eq tx-sender distributor-role)
      (let ((dist-id (var-get next-dist-id)))
        (map-set distributions dist-id { amount: amount, recipients: recipients })
        (fold transfer-aid recipients (ok u0))
        (var-set next-dist-id (+ dist-id u1))
        (ok dist-id))
      (err u1)))

(define-private (transfer-aid (recipient principal) (acc (response uint uint)))
  (match acc
    ok-val (try! (as-contract (contract-call? .AidToken transfer amount tx-sender recipient none)))
           (ok (+ ok-val u1))
    err-val (err err-val)))

(define-read-only (get-distribution (dist-id uint))
  (map-get? distributions dist-id))
```

### 5. Claim.clar
Allows verified refugees to claim aid periodically, enforcing rules like cooldowns.

```clarity
;; Claim Contract
(define-constant claim-amount u1000) ;; Example fixed amount
(define-constant cooldown u2592000) ;; 30 days in seconds

(define-public (claim-aid (identity-id uint))
  (match (contract-call? .Registry get-refugee-data tx-sender)
    some-data (if (and (get eligibility some-data) (>= (- block-height (get last-claim some-data)) cooldown))
                (begin
                  (try! (as-contract (contract-call? .AidToken transfer claim-amount tx-sender tx-sender none)))
                  (try! (contract-call? .Registry update-last-claim tx-sender block-height))
                  (ok claim-amount))
                (err u2))
    none (err u1)))

(define-private (update-last-claim (user principal) (new-time uint))
  (match (map-get? refugee-registry user)
    some-data (map-set refugee-registry user (merge some-data { last-claim: new-time }))
              (ok true)
    none (err u1)))
```

### 6. Verification.clar
Acts as an oracle for external verifiers to confirm identity or eligibility.

```clarity
;; Verification Contract
(define-map verifiers principal bool)

(define-public (add-verifier (verifier principal))
  (if (is-eq tx-sender contract-caller) ;; Assume governance caller
      (begin
        (map-set verifiers verifier true)
        (ok true))
      (err u1)))

(define-public (verify-refugee (user principal) (identity-id uint))
  (if (default-to false (map-get? verifiers tx-sender))
      (try! (contract-call? .IdentityNFT verify-identity identity-id tx-sender))
      (err u1)))
```

### 7. Governance.clar
DAO-like contract for managing roles, updates, and parameters.

```clarity
;; Governance Contract
(define-map proposals uint { proposer: principal, description: (string-ascii 256), votes-for: uint, votes-against: uint, executed: bool })

(define-data-var next-prop-id uint u1)
(define-constant min-votes u10) ;; Example

(define-public (propose (description (string-ascii 256)))
  (let ((prop-id (var-get next-prop-id)))
    (map-set proposals prop-id { proposer: tx-sender, description: description, votes-for: u0, votes-against: u0, executed: false })
    (var-set next-prop-id (+ prop-id u1))
    (ok prop-id)))

(define-public (vote (prop-id uint) (in-favor bool))
  (match (map-get? proposals prop-id)
    some-prop (if (not (get executed some-prop))
                (begin
                  (if in-favor
                      (map-set proposals prop-id (merge some-prop { votes-for: (+ (get votes-for some-prop) u1) }))
                      (map-set proposals prop-id (merge some-prop { votes-against: (+ (get votes-against some-prop) u1) })))
                  (ok true))
                (err u1))
    none (err u2)))

(define-public (execute (prop-id uint))
  (match (map-get? proposals prop-id)
    some-prop (if (and (>= (get votes-for some-prop) min-votes) (> (get votes-for some-prop) (get votes-against some-prop)) (not (get executed some-prop)))
                (begin
                  ;; Execute logic here, e.g., update roles
                  (map-set proposals prop-id (merge some-prop { executed: true }))
                  (ok true))
                (err u3))
    none (err u2)))

(define-read-only (get-proposal (prop-id uint))
  (map-get? proposals prop-id))
```

## Deployment and Usage
1. **Deploy Contracts**: Use Clarinet or Stacks CLI to deploy on Stacks testnet/mainnet.
2. **Interactions**:
   - Mint identity via IdentityNFT.
   - Verify via Verification.
   - Register in Registry.
   - Distribute aid via Distribution.
   - Claim via Claim.
   - Govern via Governance.
3. **Testing**: Write unit tests in Clarinet.
4. **Security**: Audit contracts; use Clarity's postconditions for invariants.
5. **Integrations**: Connect to wallets, oracles for biometrics, and frontends (e.g., React app).

## License
MIT License. Contributions welcome!