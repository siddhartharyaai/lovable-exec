import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { intent, traceId } = await req.json();
    const query = intent.entities?.query || '';
    const searchType = intent.entities?.type || 'general'; // 'general' or 'specific'
    
    console.log(`[${traceId}] Search query: ${query}, type: ${searchType}`);

    const serpApiKey = Deno.env.get('SERP_API_KEY');
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    let message = '';

    if (searchType === 'specific' && firecrawlApiKey) {
      // Use Firecrawl for specific, detailed searches
      console.log(`[${traceId}] Using Firecrawl for specific search`);
      
      const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 3,
        }),
      });

      if (!searchResponse.ok) {
        throw new Error('Firecrawl search failed');
      }

      const searchData = await searchResponse.json();
      const results = searchData.data || [];

      if (results.length === 0) {
        message = '🔍 No results found for your query.';
      } else {
        // Use AI to summarize the results
        const resultText = results.map((r: any) => 
          `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.markdown?.substring(0, 500) || r.description}`
        ).join('\n\n');

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { 
                role: 'system', 
                content: 'Summarize these search results concisely. Focus on answering the user query directly. Maximum 800 characters. Include source URLs at the end.' 
              },
              { 
                role: 'user', 
                content: `Query: ${query}\n\nResults:\n${resultText}` 
              }
            ],
            temperature: 0.3,
            max_tokens: 300,
          }),
        });

        const aiData = await aiResponse.json();
        message = `🔍 **Search Results**\n\n${aiData.choices[0].message.content}`;
      }
    } else {
      // Use SERP API for general searches
      console.log(`[${traceId}] Using SERP API for general search`);
      
      const serpResponse = await fetch(
        `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpApiKey}&num=5`
      );

      if (!serpResponse.ok) {
        throw new Error('SERP API search failed');
      }

      const serpData = await serpResponse.json();
      const organicResults = serpData.organic_results || [];

      if (organicResults.length === 0) {
        message = '🔍 No results found for your query.';
      } else {
        // Use AI to summarize the results
        const resultText = organicResults.slice(0, 5).map((r: any) => 
          `Title: ${r.title}\nSnippet: ${r.snippet}\nLink: ${r.link}`
        ).join('\n\n');

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { 
                role: 'system', 
                content: 'Summarize these search results concisely. Answer the query directly with key points. Maximum 1000 characters. List 2-3 key sources at the end.' 
              },
              { 
                role: 'user', 
                content: `Query: ${query}\n\nTop results:\n${resultText}` 
              }
            ],
            temperature: 0.3,
            max_tokens: 350,
          }),
        });

        const aiData = await aiResponse.json();
        message = `🔍 **Search Results**\n\n${aiData.choices[0].message.content}`;
      }
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in handle-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      message: `⚠️ Failed to search: ${errorMessage}` 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});