;; AidToken.clar
;; Robust fungible token for aid distribution, SIP-010 compliant, with minting controls, pausing, blacklisting, and burn features.

(define-fungible-token aid-token)

(define-trait admin-trait
  (
    (is-admin (principal) (response bool uint))
  ))

(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-PAUSED u201)
(define-constant ERR-INVALID-AMOUNT u202)
(define-constant ERR-BLACKLISTED u203)
(define-constant ERR-MAX-SUPPLY u204)
(define-constant ERR-INVALID-PRINCIPAL u205)
(define-constant ERR-INVALID-URI u206)
(define-constant ERR-GAS-LIMIT u207)
(define-constant ERR-NOT-VERIFIED u208)
(define-constant ERR-NOT-FOUND u209)
(define-constant MAX-SUPPLY u1000000000000)  ;; 1 trillion
(define-constant MAX-URI-LEN u256)
(define-constant MAX-BATCH-SIZE u5)  ;; Reduced to 5 for gas efficiency

(define-map admins principal bool)
(define-map blacklisted principal bool)

(define-data-var total-supply uint u0)
(define-data-var contract-paused bool false)
(define-data-var contract-owner principal tx-sender)
(define-data-var token-name (string-ascii 32) "AidToken")
(define-data-var token-symbol (string-ascii 10) "AID")
(define-data-var token-decimals uint u6)
(define-data-var token-uri (optional (string-utf8 256)) none)

(define-private (is-valid-principal (p principal))
  (and
    (not (is-eq p (as-contract tx-sender)))  ;; Prevent contract self-reference
    (is-standard p)))  ;; Ensure it's a standard principal

(define-private (is-valid-uri (uri (optional (string-utf8 256))))
  (match uri
    some-uri (<= (len some-uri) MAX-URI-LEN)
    true))  ;; none is valid

(define-private (log-event (message (string-ascii 100)))
  (print message))

(define-public (set-paused (paused bool))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (var-set contract-paused paused)
    (log-event (if paused "Contract paused" "Contract unpaused"))
    (ok true)))

(define-public (add-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-principal new-admin) (err ERR-INVALID-PRINCIPAL))
    (map-set admins new-admin true)
    (log-event "Admin added")
    (ok true)))

(define-public (remove-admin (admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-principal admin) (err ERR-INVALID-PRINCIPAL))
    (map-set admins admin false)
    (log-event "Admin removed")
    (ok true)))

(define-private (is-admin (caller principal))
  (or (is-eq caller (var-get contract-owner)) (default-to false (map-get? admins caller))))

(define-public (blacklist (account principal) (blacklist bool))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-principal account) (err ERR-INVALID-PRINCIPAL))
    (map-set blacklisted account blacklist)
    (log-event (if blacklist "Account blacklisted" "Account unblacklisted"))
    (ok true)))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-eq tx-sender sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (is-valid-principal sender) (err ERR-INVALID-PRINCIPAL))
    (asserts! (is-valid-principal recipient) (err ERR-INVALID-PRINCIPAL))
    (asserts! (not (default-to false (map-get? blacklisted sender))) (err ERR-BLACKLISTED))
    (asserts! (not (default-to false (map-get? blacklisted recipient))) (err ERR-BLACKLISTED))
    (try! (ft-transfer? aid-token amount sender recipient))
    (log-event "Tokens transferred")
    (ok true)))

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-admin tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (is-valid-principal recipient) (err ERR-INVALID-PRINCIPAL))
    (asserts! (<= (+ (var-get total-supply) amount) MAX-SUPPLY) (err ERR-MAX-SUPPLY))
    (asserts! (not (default-to false (map-get? blacklisted recipient))) (err ERR-BLACKLISTED))
    (try! (ft-mint? aid-token amount recipient))
    (var-set total-supply (+ (var-get total-supply) amount))
    (log-event "Tokens minted")
    (ok true)))

(define-public (burn (amount uint) (sender principal))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-eq tx-sender sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (is-valid-principal sender) (err ERR-INVALID-PRINCIPAL))
    (try! (ft-burn? aid-token amount sender))
    (var-set total-supply (- (var-get total-supply) amount))
    (log-event "Tokens burned")
    (ok true)))

(define-public (set-token-uri (new-uri (optional (string-utf8 256))))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-uri new-uri) (err ERR-INVALID-URI))
    (var-set token-uri new-uri)
    (log-event "Token URI updated")
    (ok true)))

(define-read-only (get-name)
  (ok (var-get token-name)))

(define-read-only (get-symbol)
  (ok (var-get token-symbol)))

(define-read-only (get-decimals)
  (ok (var-get token-decimals)))

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance aid-token account)))

(define-read-only (get-total-supply)
  (ok (var-get total-supply)))

(define-read-only (get-token-uri)
  (ok (var-get token-uri)))

(define-read-only (is-blacklisted (account principal))
  (ok (default-to false (map-get? blacklisted account))))

;; Batch mint (limited to 5)
(define-public (batch-mint (recipients (list 5 {recipient: principal, amount: uint})))
  (begin
    (asserts! (<= (len recipients) MAX-BATCH-SIZE) (err ERR-GAS-LIMIT))
    (log-event "Starting batch mint")
    (fold batch-mint-iter recipients (ok u0))))

(define-private (batch-mint-iter (entry {recipient: principal, amount: uint}) (prev (response uint uint)))
  (match prev
    count
      (match (mint (get amount entry) (get recipient entry))
        success (+ count u1)
        error prev)
    error prev))

;; Bulk blacklist (limited to 5 for gas efficiency)
(define-public (bulk-blacklist (accounts (list 5 principal)) (blacklist bool))
  (begin
    (asserts! (<= (len accounts) MAX-BATCH-SIZE) (err ERR-GAS-LIMIT))
    (asserts! (is-admin tx-sender) (err ERR-NOT-AUTHORIZED))
    (map bulk-validate-principal accounts)  ;; Validate principals early
    (log-event "Starting bulk blacklist")
    (fold bulk-blacklist-iter accounts (ok u0))))

(define-private (bulk-validate-principal (account principal))
  (asserts! (is-valid-principal account) (err ERR-INVALID-PRINCIPAL)))

(define-private (bulk-blacklist-iter (account principal) (prev (response uint uint)))
  (match prev
    count
      (begin
        (log-event "Processing blacklist entry")
        (match (blacklist account blacklist)
          success (+ count u1)
          error prev))
    error prev))

;; Transfer ownership
(define-public (transfer-contract-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-principal new-owner) (err ERR-INVALID-PRINCIPAL))
    (var-set contract-owner new-owner)
    (log-event "Contract ownership transferred")
    (ok true)))

;; Integration with IdentityNFT
(define-public (mint-to-verified-nft (nft-id uint) (amount uint) (recipient principal))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-ok (contract-call? .IdentityNFT is-verified nft-id)) (err ERR-NOT-VERIFIED))
    (asserts! (is-eq (unwrap! (contract-call? .IdentityNFT get-owner nft-id) (err ERR-NOT-FOUND)) recipient) (err ERR-NOT-AUTHORIZED))
    (try! (mint amount recipient))
    (log-event "Tokens minted to verified NFT holder")
    (ok true)))