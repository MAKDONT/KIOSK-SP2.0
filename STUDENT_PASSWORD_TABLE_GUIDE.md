# Student Password Table Implementation

## Overview
This document outlines the secure password storage implementation for student accounts. Passwords are stored in a dedicated `student_passwords` table, separate from student information, following security best practices.

## Database Schema

### student_passwords Table

```sql
CREATE TABLE public.student_passwords (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4 (),
  student_id uuid NOT NULL,
  password_hash text NOT NULL,
  created_at timestamp without time zone NULL DEFAULT now(),
  updated_at timestamp without time zone NULL DEFAULT now(),
  last_changed_at timestamp without time zone NULL DEFAULT now(),
  CONSTRAINT student_passwords_pkey PRIMARY KEY (id),
  CONSTRAINT student_passwords_student_id_key UNIQUE (student_id),
  CONSTRAINT student_passwords_student_id_fk FOREIGN KEY (student_id) 
    REFERENCES public.students (id) ON DELETE CASCADE
)
```

## Key Features

1. **Separate Table**: Password data is stored separately from student information
2. **One-to-One Relationship**: Each student has one password record (enforced by UNIQUE constraint)
3. **Automatic Cascading**: When a student is deleted, their password record is automatically removed
4. **Timestamp Tracking**: 
   - `created_at`: When password was first set
   - `updated_at`: When password table record was last updated
   - `last_changed_at`: When password was last changed

## Password Hashing

Passwords are hashed using Node.js's native `crypto.scryptSync` function:

```typescript
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hashedPassword = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashedPassword}`;
}
```

**Format**: `salt:hash` (colon-separated)

## Password Verification

```typescript
function verifyPassword(password: string, hash: string): boolean {
  const [salt, storedHash] = hash.split(':');
  const hashedPassword = scryptSync(password, salt, 64).toString('hex');
  return timingSafeEqual(
    Buffer.from(storedHash),
    Buffer.from(hashedPassword)
  );
}
```

Uses timing-safe comparison to prevent timing attacks.

## Implementation Details

### When Student Registers (Manual Input)
1. User provides password during registration
2. Password is hashed using `hashPassword()`
3. Hash is stored in `student_passwords` table
4. Password is NOT stored in plaintext anywhere

### When Student Updates Password
1. New password is hashed
2. Existing `student_passwords` record is updated
3. `last_changed_at` timestamp is updated

### During Queue Confirmation
1. Student enters password in confirmation modal
2. Password is verified against the stored hash
3. If match, consultation booking proceeds
4. Password hash is never transmitted over network unencrypted

## Migration Steps

1. **Run the migration**:
   ```sql
   -- From migration-create-student-passwords-table.sql
   ```

2. **Verify table creation**:
   ```sql
   SELECT * FROM public.student_passwords LIMIT 1;
   ```

3. **Check indexes**:
   ```sql
   SELECT indexname FROM pg_indexes 
   WHERE tablename = 'student_passwords';
   ```

## API Endpoints

### POST /api/queue/join
Accepts `student_password` parameter and handles:
- New student creation with password
- Existing student password update
- Password hashing and secure storage

## Security Considerations

✅ **Implemented:**
- Passwords are hashed, not stored in plaintext
- Using cryptographically secure salt generation
- Timing-safe comparison for verification
- Separate table for password data
- One-time hash per password
- Automatic password record cascade deletion

⚠️ **Recommendations:**
- Use HTTPS for all connections (production)
- Implement rate limiting on password verification
- Add password strength requirements (minimum length, complexity)
- Consider password reset functionality
- Regular security audits
- Monitor password change activity

## Data Retention

- Passwords are retained as long as the student account exists
- When a student account is deleted, password record is automatically removed
- Password change history is not retained (only last_changed_at timestamp)

## Future Enhancements

1. **Password Strength Policy**
   - Minimum length enforcement
   - Character type requirements
   - Common password blacklist

2. **Password Reset**
   - Email-based password reset
   - Temporary reset tokens

3. **Login Tracking**
   - Log password verification attempts
   - Alert on suspicious activity
   - Account lockout after failed attempts

4. **Multi-Factor Authentication**
   - SMS/Email verification
   - TOTP support

5. **Audit Logging**
   - Track all password changes
   - Maintain audit trail for compliance
