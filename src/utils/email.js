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
      subject: 'Password Reset Request',
      html: `
        <h1>Password Reset Request</h1>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
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
