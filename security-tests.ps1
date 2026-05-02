# Comprehensive Security Testing Script
param()

$BaseUrl = "http://localhost:8080"
$TestResults = @{}

function Test-HealthCheck {
    Write-Host "`n[HEALTH CHECK]" -ForegroundColor Cyan
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/health" -Method GET -ErrorAction Stop
        $data = $response.Content | ConvertFrom-Json
        Write-Host "PASS: Server is running and healthy" -ForegroundColor Green
        $TestResults["Health Check"] = "PASS"
        return $true
    }
    catch {
        Write-Host "FAIL: Health check failed - $_" -ForegroundColor Red
        $TestResults["Health Check"] = "FAIL"
        return $false
    }
}

function Test-PasswordRequirements {
    Write-Host "`n[PASSWORD REQUIREMENTS]" -ForegroundColor Cyan
    
    # Test 1: Password too short
    $body = @{
        username = "short_$(Get-Random)"
        email = "short_$(Get-Random)@example.com"
        password = "Short1!"
        confirmPassword = "Short1!"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/register" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
        Write-Host "FAIL: Should reject password less than 8 characters" -ForegroundColor Red
        return $false
    }
    catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            Write-Host "PASS: Rejects passwords under 8 characters" -ForegroundColor Green
            
            # Test 2: Missing special character
            $body = @{
                username = "nospecial_$(Get-Random)"
                email = "nospecial_$(Get-Random)@example.com"
                password = "NoSpecial123"
                confirmPassword = "NoSpecial123"
            } | ConvertTo-Json
            
            try {
                $response = Invoke-WebRequest -Uri "$BaseUrl/api/register" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
                Write-Host "FAIL: Should require special characters" -ForegroundColor Red
                return $false
            }
            catch {
                if ($_.Exception.Response.StatusCode.value__ -eq 400) {
                    Write-Host "PASS: Requires special characters" -ForegroundColor Green
                    $TestResults["Password Requirements"] = "PASS"
                    return $true
                }
            }
        }
    }
    
    $TestResults["Password Requirements"] = "FAIL"
    return $false
}

function Test-SQLInjectionProtection {
    Write-Host "`n[SQL INJECTION PROTECTION]" -ForegroundColor Cyan
    
    # Attempt SQL injection
    $payload = "admin' OR '1'='1"
    $body = @{
        username = $payload
        password = "TestPass123!@#"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/login" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 401) {
            Write-Host "PASS: SQL injection payload treated as literal username" -ForegroundColor Green
            $TestResults["SQL Injection Protection"] = "PASS"
            return $true
        }
    }
    
    Write-Host "FAIL: SQL injection test inconclusive" -ForegroundColor Red
    $TestResults["SQL Injection Protection"] = "FAIL"
    return $false
}

function Test-InputSanitization {
    Write-Host "`n[INPUT SANITIZATION (XSS Prevention)]" -ForegroundColor Cyan
    
    # Try to register with HTML/Script tags
    $xssPayload = "<script>alert('XSS')</script>"
    $body = @{
        username = $xssPayload
        email = "test@example.com"
        password = "TestPass123!@#"
        confirmPassword = "TestPass123!@#"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/register" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
        Write-Host "FAIL: Should reject HTML/Script tags in input" -ForegroundColor Red
        return $false
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 400) {
            Write-Host "PASS: Rejects HTML/Script tags in input" -ForegroundColor Green
            $TestResults["Input Sanitization (XSS)"] = "PASS"
            return $true
        }
    }
    
    $TestResults["Input Sanitization (XSS)"] = "FAIL"
    return $false
}

function Test-SecurityHeaders {
    Write-Host "`n[SECURITY HEADERS]" -ForegroundColor Cyan
    
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/health" -Method GET -ErrorAction Stop
        
        $headers = $response.Headers
        $securityHeaders = @{
            'X-Content-Type-Options' = 'nosniff'
            'X-Frame-Options' = 'DENY'
            'X-XSS-Protection' = 'Present'
            'Content-Security-Policy' = 'Present'
            'Strict-Transport-Security' = 'Present'
        }
        
        $allPresent = $true
        foreach ($header in $securityHeaders.Keys) {
            if ($headers.ContainsKey($header)) {
                Write-Host "  PASS: $header" -ForegroundColor Green
            } else {
                Write-Host "  FAIL: $header missing" -ForegroundColor Yellow
                $allPresent = $false
            }
        }
        
        if ($allPresent) {
            Write-Host "PASS: All security headers present" -ForegroundColor Green
            $TestResults["Security Headers"] = "PASS"
        } else {
            Write-Host "WARN: Some headers missing" -ForegroundColor Yellow
            $TestResults["Security Headers"] = "PARTIAL"
        }
        return $allPresent
    }
    catch {
        Write-Host "FAIL: Could not retrieve headers - $_" -ForegroundColor Red
        $TestResults["Security Headers"] = "FAIL"
        return $false
    }
}

function Test-AccountLockout {
    Write-Host "`n[ACCOUNT LOCKOUT AFTER 3 FAILED ATTEMPTS]" -ForegroundColor Cyan
    
    $username = "lockout_$(Get-Random)"
    $email = "lockout_$(Get-Random)@example.com"
    $validPass = "ValidPass123!@#"
    $wrongPass = "WrongPass123!@#"
    
    # Register user first
    $body = @{
        username = $username
        email = $email
        password = $validPass
        confirmPassword = $validPass
    } | ConvertTo-Json
    
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/register" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
        $regData = $response.Content | ConvertFrom-Json
        
        if ($regData.ok) {
            $lockedOut = $false
            
            # Try 4 failed logins
            for ($i = 1; $i -le 4; $i++) {
                $loginBody = @{
                    username = $username
                    password = $wrongPass
                } | ConvertTo-Json
                
                try {
                    $response = Invoke-WebRequest -Uri "$BaseUrl/api/login" -Method POST -Body $loginBody -ContentType "application/json" -ErrorAction Stop
                }
                catch {
                    $statusCode = $_.Exception.Response.StatusCode.value__
                    $respData = $_.Exception.Response.Content.ToString() | ConvertFrom-Json -ErrorAction SilentlyContinue
                    
                    if ($statusCode -eq 429) {
                        Write-Host "  PASS: Attempt $i - Account locked (HTTP 429)" -ForegroundColor Green
                        $lockedOut = $true
                    } elseif ($statusCode -eq 401) {
                        Write-Host "  PASS: Attempt $i - Invalid credentials (HTTP 401)" -ForegroundColor Green
                    }
                }
            }
            
            if ($lockedOut) {
                Write-Host "PASS: Account locked after 3 failed attempts" -ForegroundColor Green
                $TestResults["Account Lockout"] = "PASS"
                return $true
            }
        }
    }
    catch {
        Write-Host "Note: $_" -ForegroundColor Yellow
    }
    
    $TestResults["Account Lockout"] = "FAIL"
    return $false
}

function Test-ValidRegistration {
    Write-Host "`n[VALID REGISTRATION & LOGIN]" -ForegroundColor Cyan
    
    $username = "testuser_$(Get-Random)"
    $email = "testuser_$(Get-Random)@example.com"
    $password = "ValidPass123!@#"
    
    $body = @{
        username = $username
        email = $email
        password = $password
        confirmPassword = $password
    } | ConvertTo-Json
    
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/register" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
        $data = $response.Content | ConvertFrom-Json
        
        if ($data.ok -and $data.qrCode) {
            Write-Host "  PASS: Registration successful" -ForegroundColor Green
            Write-Host "  PASS: 2FA QR Code generated" -ForegroundColor Green
            
            # Test login request
            $loginBody = @{
                username = $username
                password = $password
            } | ConvertTo-Json
            
            try {
                $loginResponse = Invoke-WebRequest -Uri "$BaseUrl/api/login" -Method POST -Body $loginBody -ContentType "application/json" -ErrorAction Stop
                $loginData = $loginResponse.Content | ConvertFrom-Json
                
                if ($loginData.requires2FA) {
                    Write-Host "  PASS: Login prompts for 2FA" -ForegroundColor Green
                    Write-Host "PASS: Valid registration and login flow working" -ForegroundColor Green
                    $TestResults["Valid Registration & Login"] = "PASS"
                    return $true
                }
            }
            catch {
                Write-Host "  Note: Login response - $_" -ForegroundColor Yellow
            }
        }
    }
    catch {
        $error = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        Write-Host "Note: $_" -ForegroundColor Yellow
    }
    
    $TestResults["Valid Registration & Login"] = "FAIL"
    return $false
}

# ============================================
# RUN ALL TESTS
# ============================================

Write-Host "`n" -ForegroundColor Magenta
Write-Host ("=" * 70) -ForegroundColor Magenta
Write-Host "    COMPREHENSIVE SECURITY VERIFICATION TEST SUITE" -ForegroundColor Magenta
Write-Host ("=" * 70) -ForegroundColor Magenta

Test-HealthCheck
Test-ValidRegistration
Test-PasswordRequirements
Test-AccountLockout
Test-SQLInjectionProtection
Test-InputSanitization
Test-SecurityHeaders

# Summary
Write-Host "`n" -ForegroundColor Magenta
Write-Host ("=" * 70) -ForegroundColor Magenta
Write-Host "    TEST SUMMARY REPORT" -ForegroundColor Magenta
Write-Host ("=" * 70) -ForegroundColor Magenta

$passCount = ($TestResults.Values | Where-Object { $_ -eq "PASS" }).Count
$failCount = ($TestResults.Values | Where-Object { $_ -eq "FAIL" }).Count
$partialCount = ($TestResults.Values | Where-Object { $_ -eq "PARTIAL" }).Count

foreach ($test in $TestResults.GetEnumerator()) {
    $status = $test.Value
    $color = if ($status -eq "PASS") { "Green" } elseif ($status -eq "FAIL") { "Red" } else { "Yellow" }
    Write-Host "$($test.Key): " -NoNewline
    Write-Host $status -ForegroundColor $color
}

Write-Host "`nTotal Tests: $($TestResults.Count)" -ForegroundColor Cyan
Write-Host "Passed: $passCount" -ForegroundColor Green
Write-Host "Failed: $failCount" -ForegroundColor Red
Write-Host "Partial: $partialCount" -ForegroundColor Yellow
Write-Host ("=" * 70) -ForegroundColor Magenta
