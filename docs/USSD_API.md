# USSD API Documentation

## Overview

The USSD API enables integration with telecom providers to offer CrossBridge services through USSD codes on feature phones and smartphones without internet connectivity.

## Base URL
```
https://api.crossbridge.com/api/ussd
```

## Authentication

USSD endpoints are protected by:
- IP whitelist for telecom provider networks
- Rate limiting per phone number and IP
- Session validation
- Input validation

## Endpoints

### 1. Initiate USSD Session

**POST** `/initiate`

Starts a new USSD session for a user.

#### Request Body
```json
{
  "phone_number": "+2348123456789",
  "network_code": "MTN",
  "ussd_code": "*737#"
}
```

#### Response
```json
{
  "success": true,
  "session_id": "uuid-v4",
  "user_id": "user-uuid",
  "message": "Welcome to CrossBridge, John\n1. Check balance\n2. Send money\n3. Deposit from bank\n4. Withdraw to bank\n5. Check rates\n6. Recent transactions\n7. Settings\n0. Exit",
  "end_session": false
}
```

#### Error Response
```json
{
  "success": false,
  "message": "Welcome to CrossBridge. You need to register first.\nPlease download our app or visit our website to register.",
  "end_session": true
}
```

### 2. Process USSD Session

**POST** `/session`

Processes user input during an active USSD session.

#### Request Body
```json
{
  "phone_number": "+2348123456789",
  "session_id": "uuid-v4",
  "text": "1",
  "network_code": "MTN"
}
```

#### Response Examples

**Balance Check (text: "1")**
```json
{
  "response_type": "end",
  "message": "CrossBridge Balance:\n100.50 CBUSD\n5000.00 NGN\n250.75 GBP"
}
```

**Send Money Flow (text: "2")**
```json
{
  "response_type": "continue",
  "message": "Enter recipient phone number:\n#. Back\n00. Main Menu\n0. Exit"
}
```

**Transaction Confirmation**
```json
{
  "response_type": "end",
  "message": "Transfer successful!\n10 CBUSD sent to +2348123456789\nRef: TXN123456789"
}
```

### 3. Get Session Status

**GET** `/status/:sessionId`

Retrieves the current status of a USSD session.

#### Response
```json
{
  "success": true,
  "data": {
    "exists": true,
    "session_id": "uuid-v4",
    "user_id": "user-uuid",
    "step": "send_money_amount",
    "created_at": "2025-08-05T10:30:00Z",
    "last_activity": "2025-08-05T10:32:15Z",
    "expires_in": 120
  }
}
```

### 4. Handle Provider Callback

**POST** `/callback`

Handles callbacks from telecom providers for session management.

#### Request Body
```json
{
  "session_id": "uuid-v4",
  "phone_number": "+2348123456789",
  "text": "user_input",
  "network_code": "MTN",
  "status": "active"
}
```

#### Response
```json
{
  "success": true,
  "message": "Callback processed successfully",
  "session_id": "uuid-v4"
}
```

## USSD Flow Examples

### Complete Send Money Flow

1. **User dials *737#**
   ```
   Request: POST /initiate
   Response: Main menu
   ```

2. **User selects "2" (Send money)**
   ```
   Request: POST /session {"text": "2"}
   Response: "Enter recipient phone number:"
   ```

3. **User enters recipient phone**
   ```
   Request: POST /session {"text": "+2348987654321"}
   Response: "Enter amount to send:"
   ```

4. **User enters amount**
   ```
   Request: POST /session {"text": "50"}
   Response: "Send 50 CBUSD to +2348987654321?\n1. Confirm\n2. Cancel"
   ```

5. **User confirms**
   ```
   Request: POST /session {"text": "1"}
   Response: "Transfer successful!\n50 CBUSD sent to +2348987654321\nRef: TXN123456789"
   ```

### Navigation Commands

- **0**: Exit USSD session
- **00**: Return to main menu
- **#**: Go back to previous step

## Error Handling

### Common Error Responses

**Invalid Session**
```json
{
  "response_type": "end",
  "message": "Session expired. Please dial *737# to start again."
}
```

**Insufficient Balance**
```json
{
  "response_type": "end",
  "message": "Insufficient balance. Please deposit funds and try again."
}
```

**Invalid Recipient**
```json
{
  "response_type": "end",
  "message": "Recipient not found on CrossBridge. Please check the phone number."
}
```

**Transaction Failed**
```json
{
  "response_type": "end",
  "message": "Transfer failed. Please try again or contact support."
}
```

## Rate Limiting

- **IP Rate Limit**: 20 requests per minute per IP
- **Phone Rate Limit**: 30 requests per hour per phone number
- **Session Timeout**: 3 minutes of inactivity

## Security Features

1. **IP Whitelisting**: Only authorized telecom provider IPs can access endpoints
2. **Session Validation**: Prevents session hijacking and replay attacks
3. **Phone Number Masking**: Logs mask sensitive phone number digits
4. **Input Sanitization**: All user inputs are validated and sanitized

## Network Operator Integration

### Supported Networks

- **MTN Nigeria**: Network code "MTN"
- **Airtel Nigeria**: Network code "AIRTEL"
- **Glo Nigeria**: Network code "GLO"
- **9Mobile Nigeria**: Network code "9MOBILE"

### Integration Requirements

1. **IP Whitelisting**: Provide static IP addresses for your USSD gateway
2. **SSL/TLS**: All requests must use HTTPS
3. **Timeout Handling**: Handle 3-minute session timeouts
4. **Error Handling**: Implement proper error message display
5. **Session Management**: Support session continuation and termination

### Technical Requirements

```javascript
// Example integration code for MTN Nigeria
const ussdHandler = {
  mtn: {
    endpoint: 'https://api.crossbridge.com/api/ussd',
    
    async initiateSession(phoneNumber, ussdCode) {
      const response = await axios.post(`${this.endpoint}/initiate`, {
        phone_number: phoneNumber,
        network_code: 'MTN',
        ussd_code: ussdCode
      });
      
      return response.data;
    },
    
    async processInput(sessionId, phoneNumber, text) {
      const response = await axios.post(`${this.endpoint}/session`, {
        phone_number: phoneNumber,
        session_id: sessionId,
        text: text,
        network_code: 'MTN'
      });
      
      return response.data;
    }
  }
};
```

## Testing

### Test Phone Numbers

Use these test phone numbers in development:

- **Registered User**: +2348123456789
- **Unregistered User**: +2348999999999
- **High Balance User**: +2348111111111
- **Low Balance User**: +2348222222222

### Test Scenarios

1. **Complete Transaction Flow**: Test full send money process
2. **Balance Checking**: Test balance display for different currencies
3. **Error Handling**: Test invalid inputs and error recovery
4. **Navigation**: Test back, main menu, and exit commands
5. **Session Timeout**: Test session expiration handling

## Monitoring and Analytics

### Available Metrics

- Session initiation rate by network
- Transaction success/failure rates
- Average session duration
- Most used features
- Error frequency by type

### Logging

All USSD interactions are logged with:
- Timestamp
- Phone number (masked)
- Network code
- Input/output messages
- Session duration
- Transaction outcomes

## Support

For integration support and technical questions:

- **Email**: developers@crossbridge.com
- **Documentation**: https://docs.crossbridge.com/ussd
- **Status Page**: https://status.crossbridge.com
- **GitHub**: https://github.com/crossbridge/ussd-sdk
