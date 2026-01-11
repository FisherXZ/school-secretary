import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get('id');

  if (!userId) {
    return new Response('Invalid unsubscribe link. Missing user ID.', { status: 400 });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return new Response('Invalid user ID format.', { status: 400 });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error } = await supabase
      .from('users')
      .update({ digest_enabled: false, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      console.error('Database error:', error);
      return new Response('Something went wrong. Please try again.', { status: 500 });
    }

    // Return simple HTML confirmation
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unsubscribed - school-secretary</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              max-width: 400px;
              margin: 100px auto;
              padding: 20px;
              text-align: center;
              color: #333;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 16px;
            }
            p {
              color: #666;
              line-height: 1.5;
              margin-bottom: 12px;
            }
            .emoji {
              font-size: 48px;
              margin-bottom: 24px;
            }
          </style>
        </head>
        <body>
          <div class="emoji">📭</div>
          <h1>You've been unsubscribed</h1>
          <p>You won't receive any more morning digests.</p>
          <p>Changed your mind? Re-enable in the school-secretary extension.</p>
        </body>
      </html>
    `;

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response('Something went wrong. Please try again.', { status: 500 });
  }
});
