import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://www.yourmood.net',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown-ip';
}

function isChecked(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}

export async function POST(request) {
  try {
    const body = await request.json();

    const campaignSlug = cleanText(body.campaign_slug);
    const firstname = cleanText(body.firstname);
    const lastname = cleanText(body.lastname);
    const email = cleanText(body.email)?.toLowerCase();
    const phone = cleanText(body.phone);

    const consentRules = isChecked(body.consent_rules);
    const consentMarketing = isChecked(body.consent_marketing);

    if (!campaignSlug || !firstname || !lastname || !email) {
      return Response.json(
        { success: false, error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!consentRules) {
      return Response.json(
        { success: false, error: 'Participation rules must be accepted' },
        { status: 400, headers: corsHeaders }
      );
    }

    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || 'unknown-ua';

    const submission = {
      campaign_slug: campaignSlug,
      firstname,
      lastname,
      email,
      phone,

      q1: cleanText(body.q1),
      q2: cleanText(body.q2),
      q3: cleanText(body.q3),
      q4: cleanText(body.q4),
      q5: cleanText(body.q5),
      q6: cleanText(body.q6),
      q7: cleanText(body.q7),
      q8: cleanText(body.q8),
      q9: cleanText(body.q9),
      q10: cleanText(body.q10),
      q11: cleanText(body.q11),
      q12: cleanText(body.q12),
      q13: cleanText(body.q13),
      q14: cleanText(body.q14),
      q15: cleanText(body.q15),

      consent_rules: consentRules,
      consent_marketing: consentMarketing,

      source: cleanText(body.source),
      page_url: cleanText(body.page_url),
      user_agent: userAgent,
      ip_hash: sha256(ip)
    };

    const { data, error } = await supabase
      .from('quiz_submissions')
      .insert(submission)
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return Response.json(
          {
            success: false,
            alreadySubmitted: true,
            error: 'This email has already submitted this campaign'
          },
          { status: 409, headers: corsHeaders }
        );
      }

      console.error('quiz-submit insert error:', error);

      return Response.json(
        { success: false, error: 'Failed to save submission' },
        { status: 500, headers: corsHeaders }
      );
    }

    return Response.json(
      {
        success: true,
        submission_id: data.id
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('quiz-submit crash:', err);

    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
