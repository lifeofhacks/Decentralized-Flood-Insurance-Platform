;; Water Level Monitoring Contract
;; Tracks river and rainfall data from sensors

;; Define data variables
(define-data-var last-reading-id uint u0)

;; Define data maps
(define-map water-level-readings
  { reading-id: uint }
  {
    location-code: (string-ascii 10),
    river-level: uint,
    rainfall-amount: uint,
    reading-time: uint,
    sensor-id: (string-ascii 20),
    is-flood-condition: bool
  }
)

;; Map of flood thresholds by location
(define-map flood-thresholds
  { location-code: (string-ascii 10) }
  {
    river-level-threshold: uint,
    rainfall-threshold: uint,
    combined-threshold: uint,
    last-updated: uint
  }
)

;; Map of authorized data providers
(define-map authorized-providers
  { provider: principal }
  { authorized: bool }
)

;; Map of active flood alerts
(define-map flood-alerts
  { location-code: (string-ascii 10) }
  {
    alert-level: uint,
    start-time: uint,
    last-reading-id: uint,
    is-active: bool
  }
)

;; Submit a new water level reading
(define-public (submit-water-level-reading
                (location-code (string-ascii 10))
                (river-level uint)
                (rainfall-amount uint)
                (sensor-id (string-ascii 20)))
  (let (
    (reading-id (+ (var-get last-reading-id) u1))
    (is-authorized (default-to false (get authorized (map-get? authorized-providers { provider: tx-sender }))))
    (thresholds (default-to { river-level-threshold: u0, rainfall-threshold: u0, combined-threshold: u0, last-updated: u0 }
                (map-get? flood-thresholds { location-code: location-code })))
    (is-flood (check-flood-condition river-level rainfall-amount thresholds))
  )
    ;; Check if provider is authorized
    (asserts! is-authorized (err u1))

    ;; Update last reading ID
    (var-set last-reading-id reading-id)

    ;; Store the reading
    (map-set water-level-readings
      { reading-id: reading-id }
      {
        location-code: location-code,
        river-level: river-level,
        rainfall-amount: rainfall-amount,
        reading-time: block-height,
        sensor-id: sensor-id,
        is-flood-condition: is-flood
      }
    )

    ;; Update flood alert if needed
    (if is-flood
      (update-flood-alert location-code reading-id)
      (ok reading-id)
    )
  )
)

;; Helper function to check if readings indicate flood conditions
(define-private (check-flood-condition (river-level uint) (rainfall-amount uint) (thresholds { river-level-threshold: uint, rainfall-threshold: uint, combined-threshold: uint, last-updated: uint }))
  (or
    (>= river-level (get river-level-threshold thresholds))
    (>= rainfall-amount (get rainfall-threshold thresholds))
    (>= (+ river-level rainfall-amount) (get combined-threshold thresholds))
  )
)

;; Helper function to update flood alert
(define-private (update-flood-alert (location-code (string-ascii 10)) (reading-id uint))
  (let (
    (current-alert (default-to { alert-level: u0, start-time: u0, last-reading-id: u0, is-active: false }
                   (map-get? flood-alerts { location-code: location-code })))
    (new-alert-level (if (get is-active current-alert)
                       (+ (get alert-level current-alert) u1)
                       u1))
  )
    (map-set flood-alerts
      { location-code: location-code }
      {
        alert-level: new-alert-level,
        start-time: (if (get is-active current-alert)
                       (get start-time current-alert)
                       block-height),
        last-reading-id: reading-id,
        is-active: true
      }
    )
    (ok reading-id)
  )
)

;; Set flood thresholds for a location
(define-public (set-flood-thresholds
                (location-code (string-ascii 10))
                (river-level-threshold uint)
                (rainfall-threshold uint)
                (combined-threshold uint))
  (begin
    ;; In a real implementation, we would check if tx-sender is authorized
    ;; For simplicity, we're not implementing the authorization check
    (map-set flood-thresholds
      { location-code: location-code }
      {
        river-level-threshold: river-level-threshold,
        rainfall-threshold: rainfall-threshold,
        combined-threshold: combined-threshold,
        last-updated: block-height
      }
    )
    (ok true)
  )
)

;; Authorize a data provider
(define-public (authorize-provider (provider principal))
  (begin
    ;; In a real implementation, we would check if tx-sender is an admin
    ;; For simplicity, we're not implementing the authorization check
    (map-set authorized-providers
      { provider: provider }
      { authorized: true }
    )
    (ok true)
  )
)

;; Revoke provider authorization
(define-public (revoke-provider (provider principal))
  (begin
    (map-set authorized-providers
      { provider: provider }
      { authorized: false }
    )
    (ok true)
  )
)

;; Clear a flood alert
(define-public (clear-flood-alert (location-code (string-ascii 10)))
  (let (
    (current-alert (unwrap! (map-get? flood-alerts { location-code: location-code }) (err u1)))
  )
    ;; In a real implementation, we would check if tx-sender is authorized
    ;; For simplicity, we're not implementing the authorization check
    (map-set flood-alerts
      { location-code: location-code }
      (merge current-alert { is-active: false })
    )
    (ok true)
  )
)

;; Read-only functions

;; Get water level reading
(define-read-only (get-water-level-reading (reading-id uint))
  (map-get? water-level-readings { reading-id: reading-id })
)

;; Get flood thresholds
(define-read-only (get-flood-thresholds (location-code (string-ascii 10)))
  (map-get? flood-thresholds { location-code: location-code })
)

;; Get flood alert
(define-read-only (get-flood-alert (location-code (string-ascii 10)))
  (map-get? flood-alerts { location-code: location-code })
)

;; Check if a provider is authorized
(define-read-only (is-provider-authorized (provider principal))
  (default-to false (get authorized (map-get? authorized-providers { provider: provider })))
)

;; Get the last reading ID
(define-read-only (get-last-reading-id)
  (var-get last-reading-id)
)

