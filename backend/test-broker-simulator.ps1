# Test Broker Simulator Endpoint
# Tests all negotiation scenarios for the broker simulator

# API Gateway URL (update if needed)
$API_URL = "https://f4x56v8gcl.execute-api.us-east-1.amazonaws.com/prod/simulate-broker-response"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Broker Simulator Endpoint Tests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test counter
$testsPassed = 0
$testsFailed = 0

# Helper function to run test
function Test-BrokerSimulator {
    param(
        [string]$TestName,
        [hashtable]$Body,
        [string]$ExpectedAction,
        [string]$Description
    )
    
    Write-Host "Test: $TestName" -ForegroundColor Yellow
    Write-Host "Description: $Description" -ForegroundColor Gray
    Write-Host "Request:" -ForegroundColor Gray
    Write-Host ($Body | ConvertTo-Json) -ForegroundColor DarkGray
    
    try {
        $response = Invoke-RestMethod -Uri $API_URL `
            -Method Post `
            -Body ($Body | ConvertTo-Json) `
            -ContentType "application/json" `
            -ErrorAction Stop
        
        Write-Host "Response:" -ForegroundColor Green
        Write-Host ($response | ConvertTo-Json -Depth 5) -ForegroundColor Green
        
        # Verify expected action
        if ($response.action -eq $ExpectedAction) {
            Write-Host "PASS: Action is '$ExpectedAction' as expected" -ForegroundColor Green
            $script:testsPassed++
        } else {
            Write-Host "FAIL: Expected action '$ExpectedAction', got '$($response.action)'" -ForegroundColor Red
            $script:testsFailed++
        }
        
        # Verify delay is realistic
        if ($response.delaySeconds -ge 5 -and $response.delaySeconds -le 120) {
            Write-Host "PASS: Delay time is realistic ($($response.delaySeconds)s)" -ForegroundColor Green
        } else {
            Write-Host "FAIL: Delay time is unrealistic ($($response.delaySeconds)s)" -ForegroundColor Red
        }
        
        # Verify message exists
        if ($response.message -and $response.message.Length -gt 0) {
            Write-Host "PASS: Message is present" -ForegroundColor Green
        } else {
            Write-Host "FAIL: Message is missing" -ForegroundColor Red
        }
        
        # Verify brokerOffer for counter actions
        if ($ExpectedAction -eq "counter") {
            if ($response.brokerOffer -and $response.brokerOffer -gt 0) {
                Write-Host "PASS: Broker offer is present ($($response.brokerOffer))" -ForegroundColor Green
            } else {
                Write-Host "FAIL: Broker offer is missing for counter action" -ForegroundColor Red
            }
        }
        
    } catch {
        Write-Host "FAIL: Request failed with error:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        $script:testsFailed++
    }
    
    Write-Host ""
    Write-Host "----------------------------------------" -ForegroundColor Gray
    Write-Host ""
}

# Test 8.1: Driver offer at posted rate (should accept)
Test-BrokerSimulator `
    -TestName "8.1 - Driver offer at posted rate" `
    -Body @{
        negotiationId = "NEG-TEST-8.1"
        driverOffer = 2.70
        postedRate = 2.70
        marketRateAvg = 2.84
        round = 1
        maxRounds = 4
    } `
    -ExpectedAction "accept" `
    -Description "Driver offers exactly the posted rate - broker should accept immediately"

# Test 8.2: Driver offer 5% above market (should accept)
Test-BrokerSimulator `
    -TestName "8.2 - Driver offer 5% above market" `
    -Body @{
        negotiationId = "NEG-TEST-8.2"
        driverOffer = 2.98
        postedRate = 2.70
        marketRateAvg = 2.84
        round = 1
        maxRounds = 4
    } `
    -ExpectedAction "accept" `
    -Description "Driver offers 5% above market rate (2.98 vs 2.84) - broker should likely accept"

# Test 8.3: Driver offer 10% above posted (should counter)
Test-BrokerSimulator `
    -TestName "8.3 - Driver offer 10% above posted" `
    -Body @{
        negotiationId = "NEG-TEST-8.3"
        driverOffer = 2.97
        postedRate = 2.70
        marketRateAvg = 2.84
        round = 1
        maxRounds = 4
    } `
    -ExpectedAction "counter" `
    -Description "Driver offers 10% above posted rate (2.97 vs 2.70) - broker should counter halfway"

# Test 8.4: Driver offer 20% above market (should reject)
Test-BrokerSimulator `
    -TestName "8.4 - Driver offer 20% above market" `
    -Body @{
        negotiationId = "NEG-TEST-8.4"
        driverOffer = 3.41
        postedRate = 2.70
        marketRateAvg = 2.84
        round = 1
        maxRounds = 4
    } `
    -ExpectedAction "reject" `
    -Description "Driver offers 20% above market rate (3.41 vs 2.84) - broker should reject"

# Test 8.5: Final round behavior (should accept)
Test-BrokerSimulator `
    -TestName "8.5 - Final round behavior" `
    -Body @{
        negotiationId = "NEG-TEST-8.5"
        driverOffer = 3.10
        postedRate = 2.70
        marketRateAvg = 2.84
        round = 4
        maxRounds = 4
    } `
    -ExpectedAction "accept" `
    -Description "Final round (4/4) - broker should accept even high offers to close the deal"

# Test 8.6: Verify realistic delay times (additional test)
Write-Host "Test: 8.6 - Verify realistic delay times" -ForegroundColor Yellow
Write-Host "Description: Run multiple tests to verify delay times are within expected ranges" -ForegroundColor Gray
Write-Host ""

$delayTests = @(
    @{ action = "accept"; min = 5; max = 45 },
    @{ action = "counter"; min = 30; max = 120 },
    @{ action = "reject"; min = 10; max = 60 }
)

foreach ($delayTest in $delayTests) {
    $body = @{
        negotiationId = "NEG-TEST-8.6-$($delayTest.action)"
        driverOffer = if ($delayTest.action -eq "accept") { 2.70 } elseif ($delayTest.action -eq "counter") { 2.97 } else { 3.41 }
        postedRate = 2.70
        marketRateAvg = 2.84
        round = 1
        maxRounds = 4
    }
    
    try {
        $response = Invoke-RestMethod -Uri $API_URL `
            -Method Post `
            -Body ($body | ConvertTo-Json) `
            -ContentType "application/json" `
            -ErrorAction Stop
        
        $delay = $response.delaySeconds
        $min = $delayTest.min
        $max = $delayTest.max
        
        if ($delay -ge $min -and $delay -le $max) {
            Write-Host "PASS: $($delayTest.action) delay ($delay s) is within range [$min-$max]" -ForegroundColor Green
            $script:testsPassed++
        } else {
            Write-Host "FAIL: $($delayTest.action) delay ($delay s) is outside range [$min-$max]" -ForegroundColor Red
            $script:testsFailed++
        }
    } catch {
        Write-Host "FAIL: Request failed for $($delayTest.action) delay test" -ForegroundColor Red
        $script:testsFailed++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Tests Passed: $testsPassed" -ForegroundColor Green
Write-Host "Tests Failed: $testsFailed" -ForegroundColor Red
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Some tests failed. Please review the output above." -ForegroundColor Red
    exit 1
}
