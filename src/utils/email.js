const nodemailer = require('nodemailer');

let transporter;

// Initialize email transporter
const initializeEmailTransporter = () => {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
};

// Verify email configuration
const verifyEmailConfig = async () => {
  try {
    await transporter.verify();
    console.log('Email configuration verified successfully');
    return true;
  } catch (error) {
    console.error('Email configuration verification failed:', error);
    return false;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (to, resetToken) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
      to,
      subject: 'CrossBridge - Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset Request</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #ddd;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              You have requested to reset your password for your CrossBridge account.
            </p>
            
            <div style="background: #fff; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: #667eea;">Security Notice:</p>
              <p style="margin: 10px 0 0 0; font-size: 14px;">
                This reset link will expire in <strong>15 minutes</strong> for your security.
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 15px 30px; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: bold; 
                        font-size: 16px; 
                        display: inline-block;
                        transition: transform 0.2s;">
                Reset Your Password
              </a>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #856404;">
                <strong>Important:</strong> If you didn't request this password reset, please ignore this email. 
                Your account remains secure and no changes have been made.
              </p>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
              <p style="font-size: 12px; color: #666; margin: 0;">
                If the button above doesn't work, copy and paste this link into your browser:<br>
                <span style="word-break: break-all; color: #667eea;">${resetUrl}</span>
              </p>
            </div>
            
            <div style="margin-top: 20px; text-align: center;">
              <p style="font-size: 12px; color: #999; margin: 0;">
                This email was sent by CrossBridge. If you have questions, contact our support team.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      // Text version for email clients that don't support HTML
      text: `
Password Reset Request

You have requested to reset your password for your CrossBridge account.

To reset your password, click on the following link (valid for 15 minutes):
${resetUrl}

If you didn't request this password reset, please ignore this email.

If the link doesn't work, copy and paste it into your browser.

--
CrossBridge Team
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

// Send welcome email
const sendWelcomeEmail = async (to, name) => {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
      to,
      subject: 'Welcome to CrossBridge',
      html: `
        <h1>Welcome to CrossBridge!</h1>
        <p>Hello ${name},</p>
        <p>Thank you for joining CrossBridge. We're excited to have you on board!</p>
        <p>If you have any questions, feel free to reply to this email.</p>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw new Error('Failed to send welcome email');
  }
};

// Send transaction confirmation email
const sendTransactionEmail = async (to, transaction) => {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
      to,
      subject: 'Transaction Confirmation',
      html: `
        <h1>Transaction Confirmation</h1>
        <p>Your transaction has been ${transaction.status}.</p>
        <h2>Transaction Details:</h2>
        <ul>
          <li>Transaction ID: ${transaction.id}</li>
          <li>Amount: ${transaction.amount} ${transaction.currency}</li>
          <li>Status: ${transaction.status}</li>
          <li>Date: ${new Date(transaction.created_at).toLocaleString()}</li>
        </ul>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Transaction email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending transaction email:', error);
    throw new Error('Failed to send transaction confirmation email');
  }
};

// Initialize the email transporter when the module is loaded
initializeEmailTransporter();

module.exports = {
  verifyEmailConfig,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendTransactionEmail
};
