import nodemailer from 'nodemailer';
import { decrypt } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';

interface MailAccountRow {
  emailAddress: string;
  smtpHost: string;
  smtpPort: number;
  smtpSsl: boolean;
  encryptedPass: string;
  passIv: string;
  passTag: string;
}

export interface SendMailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

export async function sendMail(account: MailAccountRow, opts: SendMailOptions): Promise<{ messageId: string }> {
  const password = decrypt(account.encryptedPass, account.passIv, account.passTag);

  const transport = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSsl,
    auth: { user: account.emailAddress, pass: password },
    connectionTimeout: 30000,
    greetingTimeout: 15000,
  });

  const info = await transport.sendMail({
    from: account.emailAddress,
    to: opts.to.join(', '),
    cc: opts.cc?.join(', '),
    bcc: opts.bcc?.join(', '),
    subject: opts.subject,
    html: opts.html,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });

  logger.info({ messageId: info.messageId, to: opts.to }, 'Email sent via SMTP');
  return { messageId: info.messageId };
}
