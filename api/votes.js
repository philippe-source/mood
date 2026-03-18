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

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const campaignSlug = searchParams.get('campaign');

  if (!campaignSlug) {
    return Response.json(
      { error: 'Missing campaign' },
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
      { error: 'Campaign not found' },
      { status: 404, headers: corsHeaders }
    );
  }

  const { data: options, error: optionsError } = await supabase
    .from('vote_options')
    .select('material_key, vote_count')
    .eq('campaign_id', campaign.id);

  if (optionsError) {
    return Response.json(
      { error: 'Failed to load vote options' },
      { status: 500, headers: corsHeaders }
    );
  }

  const counts = {};
  for (const row of options || []) {
    counts[row.material_key] = row.vote_count;
  }

  return Response.json(
    {
      campaign: campaign.slug,
      isActive: campaign.is_active,
      counts
    },
    { headers: corsHeaders }
  );
}
