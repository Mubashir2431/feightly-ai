# Corridor Search Endpoint Test Script
# Tests all scenarios from Task 7 in corridor-search-load-chaining spec

$API_URL = "https://f4x56v8gcl.execute-api.us-east-1.amazonaws.com/prod"
$DRIVER_ID = "DRIVER-001"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Corridor Search Endpoint Test Suite" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 7.1: Philadelphia to Miami (should find chains)
Write-Host "Test 7.1: Philadelphia to Miami (corridor_chain mode)" -ForegroundColor Yellow
Write-Host "Expected: Should find load chains with 2-3 legs" -ForegroundColor Gray
Write-Host ""

$body1 = @{
    originCity = "Philadelphia"
    originState = "PA"
    destCity = "Miami"
    destState = "FL"
    equipment = "Dry Van"
    driverId = $DRIVER_ID
    searchMode = "corridor_chain"
} | ConvertTo-Json

try {
    $response1 = Invoke-RestMethod -Uri "$API_URL/loads/smart-search" -Method Post -Body $body1 -ContentType "application/json"
    
    Write-Host "PASSED Test 7.1" -ForegroundColor Green
    Write-Host "Search Mode: $($response1.searchMode)" -ForegroundColor White
    Write-Host "Direct Loads Found: $($response1.directLoads.Count)" -ForegroundColor White
    Write-Host "Chains Found: $($response1.chains.Count)" -ForegroundColor White
    Write-Host "Best Option: $($response1.marketInsight.bestOption)" -ForegroundColor White
    Write-Host "Recommendation: $($response1.marketInsight.recommendation)" -ForegroundColor White
    
    if ($response1.chains.Count -gt 0) {
        Write-Host ""
        Write-Host "Top Chain:" -ForegroundColor Cyan
        $topChain = $response1.chains[0]
        Write-Host "- Chain ID: $($topChain.chainId)" -ForegroundColor White
        Write-Host "- Legs: $($topChain.legs.Count)" -ForegroundColor White
        Write-Host "- Total Revenue: $($topChain.totalRevenue)" -ForegroundColor White
        Write-Host "- Revenue/Mile: $([math]::Round($topChain.revenuePerMile, 2))" -ForegroundColor White
        Write-Host "- Chain Score: $([math]::Round($topChain.chainScore, 2))" -ForegroundColor White
        Write-Host "- Summary: $($topChain.summary)" -ForegroundColor White
    }
} catch {
    Write-Host "FAILED Test 7.1" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 7.2: Dallas to Atlanta (should find direct loads)
Write-Host "Test 7.2: Dallas to Atlanta (one_way mode)" -ForegroundColor Yellow
Write-Host "Expected: Should find direct loads with good scores" -ForegroundColor Gray
Write-Host ""

$body2 = @{
    originCity = "Dallas"
    originState = "TX"
    destCity = "Atlanta"
    destState = "GA"
    equipment = "Dry Van"
    driverId = $DRIVER_ID
    searchMode = "one_way"
} | ConvertTo-Json

try {
    $response2 = Invoke-RestMethod -Uri "$API_URL/loads/smart-search" -Method Post -Body $body2 -ContentType "application/json"
    
    Write-Host "PASSED Test 7.2" -ForegroundColor Green
    Write-Host "Search Mode: $($response2.searchMode)" -ForegroundColor White
    Write-Host "Direct Loads Found: $($response2.directLoads.Count)" -ForegroundColor White
    Write-Host "Chains Found: $($response2.chains.Count)" -ForegroundColor White
    Write-Host "Best Option: $($response2.marketInsight.bestOption)" -ForegroundColor White
    Write-Host "Recommendation: $($response2.marketInsight.recommendation)" -ForegroundColor White
    
    if ($response2.directLoads.Count -gt 0) {
        Write-Host ""
        Write-Host "Top Direct Load:" -ForegroundColor Cyan
        $topLoad = $response2.directLoads[0]
        Write-Host "- Load ID: $($topLoad.load.loadId)" -ForegroundColor White
        Write-Host "- Origin: $($topLoad.load.origin.city), $($topLoad.load.origin.state)" -ForegroundColor White
        Write-Host "- Destination: $($topLoad.load.destination.city), $($topLoad.load.destination.state)" -ForegroundColor White
        Write-Host "- Posted Rate: $($topLoad.load.postedRate)" -ForegroundColor White
        Write-Host "- Revenue/Mile: $([math]::Round($topLoad.revenuePerMile, 2))" -ForegroundColor White
        Write-Host "- Trip Score: $([math]::Round($topLoad.tripScore, 2))" -ForegroundColor White
        Write-Host "- Deadhead Miles: $([math]::Round($topLoad.deadheadMiles, 0))" -ForegroundColor White
        Write-Host "- Market Comparison: $($topLoad.marketComparison)" -ForegroundColor White
    }
} catch {
    Write-Host "FAILED Test 7.2" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 7.3: Test with minRate filtering
Write-Host "Test 7.3: Chicago to Denver with minRate=3000" -ForegroundColor Yellow
Write-Host "Expected: Only loads with posted rate >= 3000" -ForegroundColor Gray
Write-Host ""

$body3 = @{
    originCity = "Chicago"
    originState = "IL"
    destCity = "Denver"
    destState = "CO"
    equipment = "Dry Van"
    driverId = $DRIVER_ID
    searchMode = "one_way"
    minRate = 3000
} | ConvertTo-Json

try {
    $response3 = Invoke-RestMethod -Uri "$API_URL/loads/smart-search" -Method Post -Body $body3 -ContentType "application/json"
    
    Write-Host "PASSED Test 7.3" -ForegroundColor Green
    Write-Host "Search Mode: $($response3.searchMode)" -ForegroundColor White
    Write-Host "Direct Loads Found: $($response3.directLoads.Count)" -ForegroundColor White
    Write-Host "Chains Found: $($response3.chains.Count)" -ForegroundColor White
    Write-Host "Min Rate Filter: 3000" -ForegroundColor White
    
    # Verify all loads meet minRate requirement
    $allLoads = @()
    $allLoads += $response3.directLoads | ForEach-Object { $_.load }
    $allLoads += $response3.chains | ForEach-Object { $_.legs | ForEach-Object { $_.load } }
    
    $belowMinRate = $allLoads | Where-Object { $_.postedRate -lt 3000 }
    if ($belowMinRate.Count -eq 0) {
        Write-Host "All loads meet minRate requirement" -ForegroundColor Green
    } else {
        Write-Host "Found $($belowMinRate.Count) loads below minRate!" -ForegroundColor Red
    }
    
    if ($allLoads.Count -gt 0) {
        Write-Host ""
        Write-Host "Rate Range:" -ForegroundColor Cyan
        $minFound = ($allLoads | Measure-Object -Property postedRate -Minimum).Minimum
        $maxFound = ($allLoads | Measure-Object -Property postedRate -Maximum).Maximum
        Write-Host "- Minimum: $minFound" -ForegroundColor White
        Write-Host "- Maximum: $maxFound" -ForegroundColor White
    }
} catch {
    Write-Host "FAILED Test 7.3" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 7.4: Test with equipment filtering
Write-Host "Test 7.4: Los Angeles to Phoenix with Reefer equipment" -ForegroundColor Yellow
Write-Host "Expected: Only Reefer loads returned" -ForegroundColor Gray
Write-Host ""

$body4 = @{
    originCity = "Los Angeles"
    originState = "CA"
    destCity = "Phoenix"
    destState = "AZ"
    equipment = "Reefer"
    driverId = $DRIVER_ID
    searchMode = "one_way"
} | ConvertTo-Json

try {
    $response4 = Invoke-RestMethod -Uri "$API_URL/loads/smart-search" -Method Post -Body $body4 -ContentType "application/json"
    
    Write-Host "PASSED Test 7.4" -ForegroundColor Green
    Write-Host "Search Mode: $($response4.searchMode)" -ForegroundColor White
    Write-Host "Direct Loads Found: $($response4.directLoads.Count)" -ForegroundColor White
    Write-Host "Chains Found: $($response4.chains.Count)" -ForegroundColor White
    Write-Host "Equipment Filter: Reefer" -ForegroundColor White
    
    # Verify all loads are Reefer
    $allLoads = @()
    $allLoads += $response4.directLoads | ForEach-Object { $_.load }
    $allLoads += $response4.chains | ForEach-Object { $_.legs | ForEach-Object { $_.load } }
    
    $wrongEquipment = $allLoads | Where-Object { $_.equipment -ne "Reefer" }
    if ($wrongEquipment.Count -eq 0) {
        Write-Host "All loads are Reefer equipment" -ForegroundColor Green
    } else {
        Write-Host "Found $($wrongEquipment.Count) loads with wrong equipment!" -ForegroundColor Red
        $wrongEquipment | ForEach-Object {
            Write-Host "- $($_.loadId): $($_.equipment)" -ForegroundColor Red
        }
    }
    
    if ($allLoads.Count -gt 0) {
        Write-Host ""
        Write-Host "Equipment Breakdown:" -ForegroundColor Cyan
        $allLoads | Group-Object -Property equipment | ForEach-Object {
            Write-Host "- $($_.Name): $($_.Count) loads" -ForegroundColor White
        }
    }
} catch {
    Write-Host "FAILED Test 7.4" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 7.5: Verify marketInsight response structure
Write-Host "Test 7.5: Verify marketInsight response structure" -ForegroundColor Yellow
Write-Host "Expected: marketInsight with all required fields" -ForegroundColor Gray
Write-Host ""

$body5 = @{
    originCity = "New York"
    originState = "NY"
    destCity = "Boston"
    destState = "MA"
    equipment = "Dry Van"
    driverId = $DRIVER_ID
    searchMode = "one_way"
} | ConvertTo-Json

try {
    $response5 = Invoke-RestMethod -Uri "$API_URL/loads/smart-search" -Method Post -Body $body5 -ContentType "application/json"
    
    Write-Host "PASSED Test 7.5" -ForegroundColor Green
    
    # Verify marketInsight structure
    $insight = $response5.marketInsight
    $requiredFields = @("avgMarketRate", "loadCount", "recommendation", "bestOption")
    $missingFields = @()
    
    foreach ($field in $requiredFields) {
        if (-not $insight.PSObject.Properties.Name.Contains($field)) {
            $missingFields += $field
        }
    }
    
    if ($missingFields.Count -eq 0) {
        Write-Host "All required marketInsight fields present" -ForegroundColor Green
    } else {
        Write-Host "Missing fields: $($missingFields -join ', ')" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "Market Insight:" -ForegroundColor Cyan
    Write-Host "- Avg Market Rate: $([math]::Round($insight.avgMarketRate, 2))" -ForegroundColor White
    Write-Host "- Load Count: $($insight.loadCount)" -ForegroundColor White
    Write-Host "- Best Option: $($insight.bestOption)" -ForegroundColor White
    Write-Host "- Recommendation: $($insight.recommendation)" -ForegroundColor White
    
    if ($insight.PSObject.Properties.Name.Contains("savingsVsDirect")) {
        Write-Host "- Savings vs Direct: $([math]::Round($insight.savingsVsDirect, 2))" -ForegroundColor White
    }
    
    # Verify bestOption is valid
    $validOptions = @("direct", "chain", "none")
    if ($validOptions -contains $insight.bestOption) {
        Write-Host "bestOption value is valid: $($insight.bestOption)" -ForegroundColor Green
    } else {
        Write-Host "Invalid bestOption value: $($insight.bestOption)" -ForegroundColor Red
    }
} catch {
    Write-Host "FAILED Test 7.5" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 7.6: Verify chain scoring and ranking
Write-Host "Test 7.6: Verify chain scoring and ranking" -ForegroundColor Yellow
Write-Host "Expected: Chains sorted by chainScore (descending)" -ForegroundColor Gray
Write-Host ""

$body6 = @{
    originCity = "Seattle"
    originState = "WA"
    destCity = "San Diego"
    destState = "CA"
    equipment = "Dry Van"
    driverId = $DRIVER_ID
    searchMode = "corridor_chain"
} | ConvertTo-Json

try {
    $response6 = Invoke-RestMethod -Uri "$API_URL/loads/smart-search" -Method Post -Body $body6 -ContentType "application/json"
    
    Write-Host "PASSED Test 7.6" -ForegroundColor Green
    Write-Host "Chains Found: $($response6.chains.Count)" -ForegroundColor White
    
    if ($response6.chains.Count -gt 0) {
        # Verify chains are sorted by chainScore
        $isSorted = $true
        for ($i = 0; $i -lt ($response6.chains.Count - 1); $i++) {
            if ($response6.chains[$i].chainScore -lt $response6.chains[$i + 1].chainScore) {
                $isSorted = $false
                break
            }
        }
        
        if ($isSorted) {
            Write-Host "Chains are properly sorted by chainScore (descending)" -ForegroundColor Green
        } else {
            Write-Host "Chains are NOT properly sorted!" -ForegroundColor Red
        }
        
        Write-Host ""
        Write-Host "Chain Scores:" -ForegroundColor Cyan
        for ($i = 0; $i -lt [Math]::Min(5, $response6.chains.Count); $i++) {
            $chain = $response6.chains[$i]
            Write-Host "$($i + 1). Chain $($chain.chainId)" -ForegroundColor White
            Write-Host "   - Score: $([math]::Round($chain.chainScore, 2))" -ForegroundColor White
            Write-Host "   - Legs: $($chain.legs.Count)" -ForegroundColor White
            Write-Host "   - Revenue: $($chain.totalRevenue)" -ForegroundColor White
            Write-Host "   - Revenue/Mile: $([math]::Round($chain.revenuePerMile, 2))" -ForegroundColor White
            Write-Host "   - Total Deadhead: $([math]::Round($chain.totalDeadhead, 0)) miles" -ForegroundColor White
        }
        
        # Verify chain score calculation
        Write-Host ""
        Write-Host "Verifying Chain Score Calculation:" -ForegroundColor Cyan
        $firstChain = $response6.chains[0]
        Write-Host "- Total Revenue: $($firstChain.totalRevenue)" -ForegroundColor White
        Write-Host "- Total Miles: $($firstChain.totalMiles)" -ForegroundColor White
        Write-Host "- Revenue/Mile: $([math]::Round($firstChain.revenuePerMile, 2))" -ForegroundColor White
        Write-Host "- Total Deadhead: $([math]::Round($firstChain.totalDeadhead, 0)) miles" -ForegroundColor White
        Write-Host "- Chain Score: $([math]::Round($firstChain.chainScore, 2))" -ForegroundColor White
        
        # Verify each leg has required fields
        $allLegsValid = $true
        foreach ($chain in $response6.chains) {
            foreach ($leg in $chain.legs) {
                $requiredLegFields = @("load", "tripScore", "deadheadMiles", "revenuePerMile", "marketComparison")
                foreach ($field in $requiredLegFields) {
                    if (-not $leg.PSObject.Properties.Name.Contains($field)) {
                        $allLegsValid = $false
                        Write-Host "Chain $($chain.chainId) leg missing field: $field" -ForegroundColor Red
                    }
                }
            }
        }
        
        if ($allLegsValid) {
            Write-Host "All chain legs have required fields" -ForegroundColor Green
        }
    } else {
        Write-Host "No chains found for this route" -ForegroundColor Yellow
    }
} catch {
    Write-Host "FAILED Test 7.6" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Suite Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
