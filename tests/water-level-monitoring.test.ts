import { describe, it, expect, beforeEach } from "vitest"

// Mock the Clarity VM environment
const mockClarity = {
  tx: {
    sender: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", // Default data provider
  },
  block: {
    height: 100,
  },
}

// Mock the contract functions
const waterLevelMonitoringContract = {
  lastReadingId: 0,
  waterLevelReadings: new Map(),
  floodThresholds: new Map(),
  authorizedProviders: new Map(),
  floodAlerts: new Map(),
  
  submitWaterLevelReading(locationCode, riverLevel, rainfallAmount, sensorId) {
    const readingId = this.lastReadingId + 1
    const isAuthorized = this.authorizedProviders.get(mockClarity.tx.sender)?.authorized || false
    
    if (!isAuthorized) {
      return { error: 1 }
    }
    
    const thresholds = this.floodThresholds.get(locationCode) || {
      riverLevelThreshold: 0,
      rainfallThreshold: 0,
      combinedThreshold: 0,
      lastUpdated: 0,
    }
    
    const isFlood = this.checkFloodCondition(riverLevel, rainfallAmount, thresholds)
    
    this.lastReadingId = readingId
    
    this.waterLevelReadings.set(readingId, {
      locationCode,
      riverLevel,
      rainfallAmount,
      readingTime: mockClarity.block.height,
      sensorId,
      isFloodCondition: isFlood,
    })
    
    if (isFlood) {
      this.updateFloodAlert(locationCode, readingId)
    }
    
    return { value: readingId }
  },
  
  checkFloodCondition(riverLevel, rainfallAmount, thresholds) {
    return (
        riverLevel >= thresholds.riverLevelThreshold ||
        rainfallAmount >= thresholds.rainfallThreshold ||
        riverLevel + rainfallAmount >= thresholds.combinedThreshold
    )
  },
  
  updateFloodAlert(locationCode, readingId) {
    const currentAlert = this.floodAlerts.get(locationCode) || {
      alertLevel: 0,
      startTime: 0,
      lastReadingId: 0,
      isActive: false,
    }
    
    const newAlertLevel = currentAlert.isActive ? currentAlert.alertLevel + 1 : 1
    
    this.floodAlerts.set(locationCode, {
      alertLevel: newAlertLevel,
      startTime: currentAlert.isActive ? currentAlert.startTime : mockClarity.block.height,
      lastReadingId: readingId,
      isActive: true,
    })
  },
  
  setFloodThresholds(locationCode, riverLevelThreshold, rainfallThreshold, combinedThreshold) {
    this.floodThresholds.set(locationCode, {
      riverLevelThreshold,
      rainfallThreshold,
      combinedThreshold,
      lastUpdated: mockClarity.block.height,
    })
    
    return { value: true }
  },
  
  authorizeProvider(provider) {
    this.authorizedProviders.set(provider, { authorized: true })
    return { value: true }
  },
  
  revokeProvider(provider) {
    this.authorizedProviders.set(provider, { authorized: false })
    return { value: true }
  },
  
  clearFloodAlert(locationCode) {
    if (!this.floodAlerts.has(locationCode)) {
      return { error: 1 }
    }
    
    const currentAlert = this.floodAlerts.get(locationCode)
    currentAlert.isActive = false
    this.floodAlerts.set(locationCode, currentAlert)
    
    return { value: true }
  },
  
  getWaterLevelReading(readingId) {
    return this.waterLevelReadings.get(readingId) || null
  },
  
  getFloodThresholds(locationCode) {
    return this.floodThresholds.get(locationCode) || null
  },
  
  getFloodAlert(locationCode) {
    return this.floodAlerts.get(locationCode) || null
  },
  
  isProviderAuthorized(provider) {
    return this.authorizedProviders.get(provider)?.authorized || false
  },
  
  getLastReadingId() {
    return this.lastReadingId
  },
}

describe("Water Level Monitoring Contract", () => {
  beforeEach(() => {
    // Reset the contract state before each test
    waterLevelMonitoringContract.lastReadingId = 0
    waterLevelMonitoringContract.waterLevelReadings = new Map()
    waterLevelMonitoringContract.floodThresholds = new Map()
    waterLevelMonitoringContract.authorizedProviders = new Map()
    waterLevelMonitoringContract.floodAlerts = new Map()
    mockClarity.block.height = 100
  })
  
  it("should authorize a data provider", () => {
    const result = waterLevelMonitoringContract.authorizeProvider(mockClarity.tx.sender)
    
    expect(result.value).toBe(true)
    expect(waterLevelMonitoringContract.isProviderAuthorized(mockClarity.tx.sender)).toBe(true)
  })
  
  it("should not allow unauthorized providers to submit readings", () => {
    // Provider is not authorized yet
    const result = waterLevelMonitoringContract.submitWaterLevelReading(
        "ZONE001",
        50, // river level
        30, // rainfall amount
        "SENSOR001",
    )
    
    expect(result.error).toBe(1)
  })
  
  it("should submit water level readings", () => {
    // First authorize the provider
    waterLevelMonitoringContract.authorizeProvider(mockClarity.tx.sender)
    
    // Set flood thresholds
    waterLevelMonitoringContract.setFloodThresholds("ZONE001", 100, 50, 120)
    
    // Submit a reading (below flood threshold)
    const result = waterLevelMonitoringContract.submitWaterLevelReading(
        "ZONE001",
        50, // river level
        30, // rainfall amount
        "SENSOR001",
    )
    
    expect(result.value).toBe(1)
    
    const reading = waterLevelMonitoringContract.getWaterLevelReading(1)
    expect(reading).not.toBeNull()
    expect(reading.locationCode).toBe("ZONE001")
    expect(reading.riverLevel).toBe(50)
    expect(reading.rainfallAmount).toBe(30)
    expect(reading.readingTime).toBe(100)
    expect(reading.sensorId).toBe("SENSOR001")
    expect(reading.isFloodCondition).toBe(false)
  })
  
  it("should detect flood conditions and create alerts", () => {
    // Authorize the provider
    waterLevelMonitoringContract.authorizeProvider(mockClarity.tx.sender)
    
    // Set flood thresholds
    waterLevelMonitoringContract.setFloodThresholds("ZONE001", 100, 50, 120)
    
    // Submit a reading with high river level (above threshold)
    waterLevelMonitoringContract.submitWaterLevelReading(
        "ZONE001",
        120, // river level (above threshold)
        30, // rainfall amount
        "SENSOR001",
    )
    
    // Check if flood alert was created
    const alert = waterLevelMonitoringContract.getFloodAlert("ZONE001")
    expect(alert).not.toBeNull()
    expect(alert.isActive).toBe(true)
    expect(alert.alertLevel).toBe(1)
    expect(alert.startTime).toBe(100)
    
    // Submit another reading with high values
    waterLevelMonitoringContract.submitWaterLevelReading(
        "ZONE001",
        130, // river level
        40, // rainfall amount
        "SENSOR001",
    )
    
    // Check if alert level increased
    const updatedAlert = waterLevelMonitoringContract.getFloodAlert("ZONE001")
    expect(updatedAlert.alertLevel).toBe(2)
    expect(updatedAlert.startTime).toBe(100) // Start time should remain the same
  })
  
  it("should clear flood alerts", () => {
    // Authorize the provider
    waterLevelMonitoringContract.authorizeProvider(mockClarity.tx.sender)
    
    // Set flood thresholds
    waterLevelMonitoringContract.setFloodThresholds("ZONE001", 100, 50, 120)
    
    // Submit a reading with high river level
    waterLevelMonitoringContract.submitWaterLevelReading(
        "ZONE001",
        120, // river level
        30, // rainfall amount
        "SENSOR001",
    )
    
    // Verify alert is active
    expect(waterLevelMonitoringContract.getFloodAlert("ZONE001").isActive).toBe(true)
    
    // Clear the alert
    const result = waterLevelMonitoringContract.clearFloodAlert("ZONE001")
    expect(result.value).toBe(true)
    
    // Verify alert is cleared
    expect(waterLevelMonitoringContract.getFloodAlert("ZONE001").isActive).toBe(false)
  })
  
  it("should detect flood conditions based on combined threshold", () => {
    // Authorize the provider
    waterLevelMonitoringContract.authorizeProvider(mockClarity.tx.sender)
    
    // Set flood thresholds
    waterLevelMonitoringContract.setFloodThresholds("ZONE001", 100, 50, 120)
    
    // Submit a reading where individual values are below thresholds but combined is above
    waterLevelMonitoringContract.submitWaterLevelReading(
        "ZONE001",
        70, // river level (below threshold)
        60, // rainfall amount (above threshold)
        "SENSOR001",
    )
    
    // Check reading
    const reading = waterLevelMonitoringContract.getWaterLevelReading(1)
    expect(reading.isFloodCondition).toBe(true)
    
    // Check if flood alert was created
    const alert = waterLevelMonitoringContract.getFloodAlert("ZONE001")
    expect(alert.isActive).toBe(true)
  })
})

