# Forgot Password Feature Implementation

## Overview
A complete "Forgot Password" feature has been implemented for the Student Consultation System. Students can now reset their password by receiving a secure reset link via their registered email address.

## Components

### 1. **Backend Endpoints** (server.ts)

#### POST `/api/students/forgot-password`
**Purpose**: Initiates password reset process

**Request Body**:
```json
{
  "email": "student@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

**Process**:
1. Validates email address
2. Finds student by email (non-existent email returns success for security)
3. Generates secure 32-byte random token
4. Creates SHA256 hash of token for storage
5. Sets 24-hour expiration time
6. Stores token hash and expiration in database
7. Sends email with reset link containing plain token
8. Email includes reset link: `{baseUrl}/reset-password?token={token}&email={email}`

**Security Features**:
- Token is hashed before storage (only hash is stored in DB)
- Plain token is sent only via email
- 24-hour expiration window
- Email not exposed if account doesn't exist (prevents user enumeration)

#### POST `/api/students/reset-password/:token`
**Purpose**: Validates token and updates password

**Request Body**:
```json
{
  "token": "hex-string-token",
  "email": "student@example.com",
  "password": "newpassword"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password has been successfully reset. You can now log in with your new password."
}
```

**Process**:
1. Validates token, password, and email are provided
2. Validates password minimum length (4 characters)
3. Hashes provided token to SHA256
4. Finds student with matching email and token hash
5. Checks token expiration
6. Updates password and clears reset token from database
7. Returns success message

**Validation**:
- Token must be valid and match stored hash
- Token must not be expired (within 24 hours)
- Password must be at least 4 characters
- Email must match stored student record

### 2. **Frontend Components**

#### Login Component (Login.tsx) - Enhanced
**New Features**:
- "Forgot Password?" button on login form
- Forgot password modal with email input
- Error and success messaging
- Integration with backend endpoints

**State Variables**:
```typescript
const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");
const [forgotPasswordError, setForgotPasswordError] = useState("");
```

**Handler Function**: `handleForgotPassword()`
- Validates email input
- Sends POST request to `/api/students/forgot-password`
- Displays success message for 5 seconds then closes modal
- Shows error messages for failed requests

#### ResetPassword Component (ResetPassword.tsx) - New
**Purpose**: Dedicated page for resetting password with token validation

**Features**:
- Extracts token and email from URL query parameters
- Validates token before showing form
- Two-step password confirmation
- Real-time validation feedback
- Success page with auto-redirect to login

**Page States**:
1. **Validating**: Initial state while checking token
2. **Invalid Token**: Shows error if token/email missing or invalid
3. **Reset Form**: Shows password input form (token is valid)
4. **Success**: Shows success message and redirects to login after 3 seconds

**Flow**:
1. User clicks reset link from email
2. Redirected to `/reset-password?token={token}&email={email}`
3. Token validation on component mount
4. User enters new password (minimum 4 characters)
5. Confirms password matches
6. Submits to `/api/students/reset-password/{token}`
7. On success, redirects to login page

### 3. **Database Migration** (migration-add-password-reset.sql)

**New Columns**:
- `password_reset_token` (text, nullable): Stores SHA256 hash of reset token
- `password_reset_expires_at` (timestamp, nullable): Token expiration time

**Indexes**:
- `idx_students_password_reset_token`: For fast token lookups
- `idx_students_password_reset_expires_at`: For cleanup operations

### 4. **Email Template**
Professional HTML email includes:
- Gradient header with system branding
- Clear instructions for password reset
- Prominent "Reset Password" button with email styling
- Plain text link fallback
- Warning about expiration (24 hours)
- Security notice about unsolicited emails
- Professional footer

## User Flow

### From Student Perspective:

**Forgot Password Process**:
1. Click "Forgot Password?" on login form
2. Enter email address associated with account
3. Receive confirmation message
4. Check email for password reset link
5. Click link or copy URL to browser
6. Enter new password (minimum 4 characters)
7. Confirm password
8. See success message
9. Redirected to login
10. Login with new password

## Security Considerations

✅ **Security Features Implemented**:
- Tokens are cryptographically secure (32 bytes of randomness)
- Tokens are hashed before database storage (SHA256)
- Plain token sent only via email (not in database)
- 24-hour expiration window
- Email verification prevents account takeover
- Password minimum length enforcement (4 characters)
- User enumeration protection (same message for existing/non-existing emails)
- Token is consumed after successful reset
- Session invalidation on password change
- HTTPS required in production

⚠️ **Best Practices**:
- Secure environment variables for SendGrid API key
- Email delivery logging for audit trail
- Token lookup includes email verification (double-check)
- Expired tokens automatically cleared by expiration time
- Password hashing (additional hashing should be done on user-sensitive data)

## Configuration Required

### Environment Variables:
```env
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@consultation-system.com
APP_URL=https://your-app-url.com  # For email links
```

### Database Setup:
Run the migration to add password reset columns:
```bash
# Apply migration using Supabase CLI or SQL directly
psql -d your_database -f migration-add-password-reset.sql
```

## Testing Checklist

- [ ] User can click "Forgot Password?" button
- [ ] Forgot password modal appears with email input
- [ ] Email validation works
- [ ] Email is sent successfully (check SendGrid logs)
- [ ] Reset link in email is clickable
- [ ] Reset link redirects to `/reset-password` page
- [ ] Invalid token shows error message
- [ ] Expired token shows error message
- [ ] Password input validates minimum length
- [ ] Password confirmation validation works
- [ ] Successful reset shows success message
- [ ] User is redirected to login after success
- [ ] New password works for login
- [ ] Old password no longer works

## Database Cleanup

To clean up expired password reset tokens:
```sql
-- Manual cleanup of expired tokens (optional)
UPDATE public.students 
SET 
  password_reset_token = NULL,
  password_reset_expires_at = NULL
WHERE password_reset_expires_at < NOW();
```

## Future Enhancements

Potential improvements for future versions:
1. Add rate limiting to prevent brute force attempts
2. Send confirmation email after successful password reset
3. Implement password strength requirements
4. Add two-factor authentication option
5. Create password reset audit log
6. Add password history to prevent reuse
7. Implement IP-based security checks
8. Add SMS option for password reset
9. Create admin panel for password reset management
10. Add passwordless login options

## Files Modified/Created

### New Files:
- `src/components/ResetPassword.tsx` - Password reset page component
- `migration-add-password-reset.sql` - Database migration

### Modified Files:
- `server.ts` - Added 2 new API endpoints
- `src/components/Login.tsx` - Added forgot password UI and modal
- `src/App.tsx` - Added route for reset password page

## Troubleshooting

### Email Not Sending
- Check `SENDGRID_API_KEY` environment variable
- Verify SendGrid account has credits
- Check email delivery logs in server console
- Verify `SENDGRID_FROM_EMAIL` is authorized in SendGrid

### Token Invalid
- Ensure 24-hour window hasn't expired
- Check token copy/paste accuracy
- Verify email matches account email
- Database migration may not be applied

### Password Not Updating
- Check database connection
- Verify password length (minimum 4 characters)
- Ensure migration was applied successfully
- Check for database constraints

## Support

For issues or questions about the forgot password feature, check:
1. Server console logs for API errors
2. SendGrid dashboard for email delivery status
3. Browser developer console for frontend errors
4. Database logs for constraint violations
