import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get('id');
  const action = url.searchParams.get('action');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Handle toggle action
  if (userId && action === 'enable') {
    try {
      await supabase
        .from('users')
        .update({ digest_enabled: true, updated_at: new Date().toISOString() })
        .eq('id', userId);

      return Response.redirect(`${url.origin}${url.pathname}?id=${userId}&success=enabled`);
    } catch (error) {
      console.error('Error enabling digest:', error);
    }
  }

  if (userId && action === 'disable') {
    try {
      await supabase
        .from('users')
        .update({ digest_enabled: false, updated_at: new Date().toISOString() })
        .eq('id', userId);

      return Response.redirect(`${url.origin}${url.pathname}?id=${userId}&success=disabled`);
    } catch (error) {
      console.error('Error disabling digest:', error);
    }
  }

  // Get user data if ID provided
  let user = null;
  if (userId) {
    try {
      const { data } = await supabase
        .from('users')
        .select('email, digest_enabled')
        .eq('id', userId)
        .single();
      user = data;
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  }

  const success = url.searchParams.get('success');

  // Render settings page
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Digest Settings — school-secretary</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 400px;
            margin: 60px auto;
            padding: 20px;
            color: #333;
          }
          h1 { font-size: 24px; margin-bottom: 8px; }
          .subtitle { color: #666; margin-bottom: 32px; font-size: 14px; }
          .card {
            background: #f9f9f9;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 16px;
          }
          .status {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
          }
          .status-label { font-weight: 500; }
          .status-value {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
          }
          .status-on { background: #d4edda; color: #155724; }
          .status-off { background: #f8d7da; color: #721c24; }
          .btn {
            display: block;
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            text-align: center;
            font-weight: 500;
          }
          .btn-primary {
            background: #4285f4;
            color: white;
          }
          .btn-primary:hover {
            background: #3367d6;
          }
          .btn-danger {
            background: #dc3545;
            color: white;
          }
          .btn-danger:hover {
            background: #c82333;
          }
          .success-msg {
            background: #d4edda;
            color: #155724;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-weight: 500;
          }
          .info-text {
            color: #666;
            font-size: 14px;
            margin-bottom: 16px;
          }
          .email-text {
            font-size: 13px;
            color: #999;
            word-break: break-all;
          }
          .no-user {
            text-align: center;
            color: #666;
          }
          .footer-text {
            color: #999;
            font-size: 13px;
            text-align: center;
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <h1>📬 Digest Settings</h1>
        <p class="subtitle">school-secretary</p>

        ${success === 'enabled' ? '<div class="success-msg">✓ Digest enabled!</div>' : ''}
        ${success === 'disabled' ? '<div class="success-msg">✓ Digest disabled.</div>' : ''}

        ${user ? `
          <div class="card">
            <div class="status">
              <span class="status-label">Morning digest</span>
              <span class="status-value ${user.digest_enabled ? 'status-on' : 'status-off'}">
                ${user.digest_enabled ? 'On' : 'Off'}
              </span>
            </div>
            <p class="info-text email-text">Sending to: ${user.email}</p>
            ${user.digest_enabled
              ? `<a href="?id=${userId}&action=disable" class="btn btn-danger">Turn Off Digest</a>`
              : `<a href="?id=${userId}&action=enable" class="btn btn-primary">Turn On Digest</a>`
            }
          </div>
          <p class="footer-text">Daily at 8am · Homework due today + this week</p>
        ` : `
          <div class="card no-user">
            <p>To access settings, open the school-secretary extension and click "Digest settings".</p>
          </div>
        `}
      </body>
    </html>
  `;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
});
