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

function scoreAnswer(question, answer) {
  const scoring = {
    q1: {
      'Violet 💜': 3,
      'Noir 🖤': 3,
      'Doré ✨': 2,
      'Coloré 🌈': 3,
      'Minimaliste argent': 2
    },
    q2: {
      'Changeant selon mon humeur': 5,
      'Audacieux et créatif': 4,
      'Discret et élégant': 2,
      'Toujours les mêmes': 0
    },
    q3: {
      'Changer régulièrement de style': 5,
      'Alterner': 3,
      'Garder le même': 0
    },
    q4: {
      'Tous les mois': 5,
      'Plusieurs fois par an': 3,
      'Occasionnel': 1,
      'Rarement': 0
    },
    q5: {
      '300+ CHF': 5,
      '150–300 CHF': 4,
      '50–150 CHF': 2,
      '<50 CHF': 0
    },
    q6: {
      'Achat coup de cœur': 4,
      'Mix': 3,
      'Réfléchi': 1
    },
    q7: {
      'Oui souvent': 5,
      'Parfois': 3,
      'Rarement': 1,
      'Jamais': 0
    },
    q8: {
      'J’adore 😍': 5,
      'Oui beaucoup': 4,
      'Pourquoi pas': 2,
      'Non': 0
    },
    q9: {
      'Tu en veux encore d’autres': 5,
      'Tu alternes': 3,
      'Tu gardes la même': 0
    },
    q10: {
      'Collectionneuse': 5,
      'J’aime tester': 4,
      'Minimaliste': 1
    },
    q11: {
      'Oui j’adore': 4,
      'Oui mais modérément': 2,
      'Non': 0
    },
    q13: {
      'Oui avec plaisir': 3,
      'Peut-être': 1,
      'Non': 0
    },
    q14: {
      'Instagram': 2,
      'TikTok': 2,
      'Facebook': 1,
      'Aucun': 0
    }
  };

  return scoring[question]?.[answer] ?? 0;
}

function computeTotalScore(body) {
  const scoredQuestions = [
    'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7',
    'q8', 'q9', 'q10', 'q11', 'q13', 'q14'
  ];

  return scoredQuestions.reduce((total, question) => {
    return total + scoreAnswer(question, cleanText(body[question]));
  }, 0);
}

function computeScoreSegment(totalScore) {
  if (totalScore >= 45) return 'ULTRA HIGH VALUE';
  if (totalScore >= 30) return 'HIGH POTENTIAL';
  if (totalScore >= 15) return 'MOYEN';
  return 'FAIBLE';
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

    const totalScore = computeTotalScore(body);
    const scoreSegment = computeScoreSegment(totalScore);

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

      total_score: totalScore,
      score_segment: scoreSegment,

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
        submission_id: data.id,
        total_score: totalScore,
        score_segment: scoreSegment
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
