import { Request, Response } from 'express';
import sgMail from '@sendgrid/mail';

export async function submitMailerIntake(req: Request, res: Response) {
  try {
    const {
      companyName,
      address,
      cityState,
      zip,
      contactName,
      contactEmail,
      contactPhone,
      crid,
      mid,
      needsCridRegistration,
      mailClass,
      mailClassOther,
      pieceType,
      pieceSize,
      approxQty,
      seedMethod,
      seedsPerDrop,
      fileFormat,
      fileFormatOther,
      hasNcoaCass,
      notes,
      submittedBy,
    } = req.body;

    // Build email HTML
    const html = `
      <div style="font-family:Tahoma,Geneva,sans-serif;font-size:14px;color:#333;max-width:600px;">
        <div style="background:#000;padding:16px 20px;border-bottom:3px solid #fb5b00;">
          <h2 style="color:#fff;margin:0;font-size:18px;">New Mailer Intake Submission</h2>
          <p style="color:#fb5b00;margin:4px 0 0;font-size:12px;">Incremental Media — Customer Onboarding</p>
        </div>

        <div style="padding:16px 20px;">
          <h3 style="color:#fb5b00;font-size:13px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:4px;">Company Information</h3>
          <table style="width:100%;font-size:13px;margin:8px 0 16px;">
            <tr><td style="color:#999;padding:3px 0;width:120px;">Company</td><td style="font-weight:600;">${companyName || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">Address</td><td>${address || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">City / State</td><td>${cityState || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">ZIP</td><td>${zip || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">Contact</td><td>${contactName || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">Email</td><td>${contactEmail || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">Phone</td><td>${contactPhone || '—'}</td></tr>
          </table>

          <h3 style="color:#fb5b00;font-size:13px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:4px;">USPS Mailer IDs</h3>
          <table style="width:100%;font-size:13px;margin:8px 0 16px;">
            <tr><td style="color:#999;padding:3px 0;width:120px;">CRID</td><td style="font-weight:600;">${crid || (needsCridRegistration ? 'NEEDS REGISTRATION' : '—')}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">MID</td><td style="font-weight:600;">${mid || (needsCridRegistration ? 'NEEDS REGISTRATION' : '—')}</td></tr>
          </table>

          <h3 style="color:#fb5b00;font-size:13px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:4px;">Mailing Details</h3>
          <table style="width:100%;font-size:13px;margin:8px 0 16px;">
            <tr><td style="color:#999;padding:3px 0;width:120px;">Mail Class</td><td>${mailClass === 'other' ? mailClassOther : mailClass || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">Piece Type</td><td>${pieceType || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">Piece Size</td><td>${pieceSize || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">Approx Qty</td><td>${approxQty || '—'}</td></tr>
          </table>

          <h3 style="color:#fb5b00;font-size:13px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:4px;">Seeds & Data</h3>
          <table style="width:100%;font-size:13px;margin:8px 0 16px;">
            <tr><td style="color:#999;padding:3px 0;width:120px;">Seed Method</td><td>${seedMethod || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">Seeds / Drop</td><td>${seedsPerDrop || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">File Format</td><td>${fileFormat === 'other' ? fileFormatOther : fileFormat || '—'}</td></tr>
            <tr><td style="color:#999;padding:3px 0;">NCOA/CASS</td><td>${hasNcoaCass || '—'}</td></tr>
          </table>

          ${notes ? `
          <h3 style="color:#fb5b00;font-size:13px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:4px;">Notes</h3>
          <p style="font-size:13px;margin:8px 0;">${notes}</p>
          ` : ''}

          <div style="border-top:2px solid #000;padding-top:8px;margin-top:16px;font-size:12px;color:#999;">
            Submitted by: <strong style="color:#333;">${submittedBy || '—'}</strong>
          </div>
        </div>
      </div>
    `;

    // Send to Impact Direct team
    if (process.env.SENDGRID_API_KEY) {
      await sgMail.send({
        to: ['rebecca@impactdirectprinting.com', 'brandon@impactdirectprinting.com', 'nick@jdgraphic.com'],
        from: {
          email: process.env.SENDGRID_FROM_EMAIL || 'brandon@impactdirectprinting.com',
          name: 'Impact Direct — Mailer Intake',
        },
        subject: `New Mailer Intake: ${companyName || 'Unknown'} (via Incremental Media)`,
        html,
      });
    }

    res.json({ success: true, message: 'Intake form submitted successfully' });
  } catch (error: any) {
    console.error('Intake submission error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
