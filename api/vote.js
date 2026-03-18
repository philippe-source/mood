import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://www.yourmood.net',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}

export async function POST(request) {
  const body = await request.json();
  const campaignSlug = String(body.campaign || '').trim();
  const material = String(body.material || '').trim();

  if (!campaignSlug || !material) {
    return Response.json(
      { success: false, error: 'Missing campaign or material' },
      { status: 400, headers: corsHeaders }
    );
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('vote_campaigns')
    .select('id, slug, is_active')
    .eq('slug', campaignSlug)
    .single();

  if (campaignError || !campaign) {
    return Response.json(
      { success: false, error: 'Campaign not found' },
      { status: 404, headers: corsHeaders }
    );
  }

  const { data: option, error: optionError } = await supabase
    .from('vote_options')
    .select('material_key, vote_count')
    .eq('campaign_id', campaign.id)
    .eq('material_key', material)
    .single();

  if (optionError || !option) {
    return Response.json(
      { success: false, error: 'Invalid material' },
      { status: 400, headers: corsHeaders }
    );
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || 'unknown-ua';
  const voterKey = sha256(`${campaign.slug}::${ip}::${userAgent}`);

  const { data: existingVote } = await supabase
    .from('votes')
    .select('id, material_key')
    .eq('campaign_id', campaign.id)
    .eq('voter_key', voterKey)
    .maybeSingle();

  if (existingVote) {
    const { data: options } = await supabase
      .from('vote_options')
      .select('material_key, vote_count')
      .eq('campaign_id', campaign.id);

    const counts = {};
    for (const row of options || []) {
      counts[row.material_key] = row.vote_count;
    }

    return Response.json(
      {
        success: false,
        alreadyVoted: true,
        votedFor: existingVote.material_key,
        counts
      },
      { headers: corsHeaders }
    );
  }

  const { error: insertVoteError } = await supabase
    .from('votes')
    .insert({
      campaign_id: campaign.id,
      material_key: material,
      voter_key: voterKey,
      ip_hash: sha256(ip),
      user_agent: userAgent
    });

  if (insertVoteError) {
    return Response.json(
      { success: false, error: 'Failed to save vote' },
      { status: 500, headers: corsHeaders }
    );
  }

  const newCount = option.vote_count + 1;

  const { error: updateError } = await supabase
    .from('vote_options')
    .update({ vote_count: newCount })
    .eq('campaign_id', campaign.id)
    .eq('material_key', material);

  if (updateError) {
    return Response.json(
      { success: false, error: 'Failed to update vote count' },
      { status: 500, headers: corsHeaders }
    );
  }

  const { data: options } = await supabase
    .from('vote_options')
    .select('material_key, vote_count')
    .eq('campaign_id', campaign.id);

  const counts = {};
  for (const row of options || []) {
    counts[row.material_key] = row.vote_count;
  }

  return Response.json(
    {
      success: true,
      alreadyVoted: false,
      votedFor: material,
      counts
    },
    { headers: corsHeaders }
  );
}
