import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const url = intent.entities?.url || '';
    const extractSchema = intent.entities?.schema || null; // Optional structured extraction schema
    
    console.log(`[${traceId}] Website scrape initiated for: \"${url}\"${extractSchema ? ' with schema extraction' : ''}`);

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    let message = '';

    // Use Firecrawl v2 scrape endpoint for single page extraction
    console.log(`[${traceId}] Using Firecrawl v2 scrape API`);
    
    const scrapePayload: any = {
      url,
      formats: ['markdown', 'html'],
      onlyMainContent: true,
      waitFor: 2000,
      timeout: 30000
    };

    // If schema provided, add structured extraction
    if (extractSchema) {
      scrapePayload.formats.push({
        type: 'extract',
        schema: extractSchema
      });
    }

    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scrapePayload),
    });

    if (!scrapeResponse.ok) {
      const errorBody = await scrapeResponse.text();
      console.error(`[${traceId}] Firecrawl scrape error: ${scrapeResponse.status}, ${errorBody}`);
      throw new Error(`Firecrawl scrape failed: ${scrapeResponse.status}`);
    }

    const scrapeData = await scrapeResponse.json();
    
    if (!scrapeData.success || !scrapeData.data) {
      console.error(`[${traceId}] Firecrawl returned unsuccessful response:`, scrapeData);
      throw new Error('Firecrawl scrape returned no data');
    }

    const pageData = scrapeData.data;
    
    // If structured extraction was requested, return that directly
    if (extractSchema && pageData.extract) {
      console.log(`[${traceId}] Returning structured extraction`);
      message = `📄 **Extracted Data from ${url}**\n\n${JSON.stringify(pageData.extract, null, 2)}`;
    } else {
      // Otherwise, use AI to summarize the scraped content
      const content = pageData.markdown?.substring(0, 3000) || pageData.html?.substring(0, 2000) || 'No content extracted';
      const metadata = pageData.metadata || {};
      
      console.log(`[${traceId}] Using AI to summarize scraped content (${content.length} chars)`);

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
              content: 'You are a web content analyzer. Summarize the provided webpage content in a clear, structured way. Focus on the main points, key information, and actionable insights. Maximum 1200 characters.' 
            },
            { 
              role: 'user', 
              content: `URL: ${url}\nTitle: ${metadata.title || 'No title'}\nDescription: ${metadata.description || 'No description'}\n\nPage Content:\n${content}\n\nProvide:\n1. Brief overview (what is this page about?)\n2. Key information/highlights (3-5 main points)\n3. Relevant details for the user` 
            }
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      if (!aiResponse.ok) {
        throw new Error('AI summarization failed');
      }

      const aiData = await aiResponse.json();
      message = `📄 **Summary of ${url}**\n\n${aiData.choices[0].message.content}\n\n_Source: ${metadata.sourceURL || url}_`;
    }

    console.log(`[${traceId}] Scrape completed successfully`);

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in handle-scrape:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      message: `⚠️ Scrape failed: ${errorMessage}. Please check the URL and try again.` 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

