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
    
    console.log(`[${traceId}] Web search initiated: "${query}", type: ${searchType}`);

    const serpApiKey = Deno.env.get('SERP_API_KEY');
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    let message = '';

    if (searchType === 'specific' && firecrawlApiKey) {
      // Use Firecrawl for deep, specific searches requiring detailed content analysis
      console.log(`[${traceId}] Using Firecrawl for in-depth search`);
      
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
        console.error(`[${traceId}] Firecrawl API error: ${searchResponse.status}`);
        throw new Error('Firecrawl search failed');
      }

      const searchData = await searchResponse.json();
      const results = searchData.data || [];

      if (results.length === 0) {
        message = '🔍 No detailed results found for your query. Try rephrasing or using a more general search.';
      } else {
        // Use AI to analyze and synthesize detailed content
        const resultText = results.map((r: any) => 
          `**${r.title}**\nURL: ${r.url}\nContent: ${r.markdown?.substring(0, 800) || r.description || 'No content available'}`
        ).join('\n\n---\n\n');

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
                content: 'You are a research assistant. Analyze the provided search results and create a comprehensive yet concise summary that directly answers the user\'s query. Include key facts, dates, numbers, and cite sources. Maximum 1000 characters.' 
              },
              { 
                role: 'user', 
                content: `User Query: "${query}"\n\nSearch Results:\n${resultText}\n\nProvide a well-structured answer with:\n1. Direct answer to the query\n2. Key supporting details\n3. Source citations (2-3 key URLs)` 
              }
            ],
            temperature: 0.3,
            max_tokens: 400,
          }),
        });

        if (!aiResponse.ok) {
          throw new Error('AI summarization failed');
        }

        const aiData = await aiResponse.json();
        message = `🔍 **Research Results**\n\n${aiData.choices[0].message.content}`;
      }
    } else {
      // Use SERP API for fast, general searches (news, weather, scores, quick facts)
      console.log(`[${traceId}] Using SERP API for general search`);
      
      const serpResponse = await fetch(
        `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpApiKey}&num=5`
      );

      if (!serpResponse.ok) {
        console.error(`[${traceId}] SERP API error: ${serpResponse.status}`);
        throw new Error('SERP API search failed');
      }

      const serpData = await serpResponse.json();
      const organicResults = serpData.organic_results || [];

      if (organicResults.length === 0) {
        message = '🔍 No results found. Try rephrasing your query or being more specific.';
      } else {
        // Use AI to create a concise, conversational summary
        const resultText = organicResults.slice(0, 5).map((r: any) => 
          `**${r.title}**\n${r.snippet || 'No description'}\nSource: ${r.link}`
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
                content: 'You are a helpful search assistant. Summarize search results concisely and conversationally. Focus on directly answering the user\'s question with the most important and current information. Include relevant numbers, dates, and facts. Maximum 1200 characters. List 2-3 key sources at the end.' 
              },
              { 
                role: 'user', 
                content: `User Query: "${query}"\n\nTop Search Results:\n${resultText}\n\nProvide a clear answer with:\n1. Direct answer (what, when, who, where, why)\n2. Key supporting details (scores, stats, context)\n3. Source links (2-3 most relevant)` 
              }
            ],
            temperature: 0.3,
            max_tokens: 450,
          }),
        });

        if (!aiResponse.ok) {
          throw new Error('AI summarization failed');
        }

        const aiData = await aiResponse.json();
        message = `🔍 **Search Results**\n\n${aiData.choices[0].message.content}`;
      }
    }

    console.log(`[${traceId}] Search completed successfully`);

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in handle-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      message: `⚠️ Search failed: ${errorMessage}. Please try again or rephrase your query.` 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});