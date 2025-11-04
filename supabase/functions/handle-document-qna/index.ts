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
    const { intent, userId, traceId } = await req.json();
    console.log(`[${traceId}] Document Q&A request:`, intent);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const query = intent.query || '';

    // Fetch user's documents
    const { data: documents, error: docsError } = await supabase
      .from('user_documents')
      .select('id, filename, content_text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (docsError) {
      throw new Error(`Database error: ${docsError.message}`);
    }

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: "You haven't uploaded any documents yet. Send me a PDF, DOC, or DOCX file and I'll help you search through it!" 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search for relevant sections using keyword matching
    const keywords = query.toLowerCase().split(' ').filter((w: string) => w.length > 3);
    const relevantSections: Array<{filename: string, content: string, score: number}> = [];

    documents.forEach(doc => {
      const content = doc.content_text.toLowerCase();
      let score = 0;
      
      keywords.forEach((keyword: string) => {
        const occurrences = (content.match(new RegExp(keyword, 'g')) || []).length;
        score += occurrences;
      });

      if (score > 0) {
        // Extract relevant paragraphs (±200 chars around first keyword)
        const firstKeyword = keywords[0];
        const index = content.indexOf(firstKeyword);
        if (index !== -1) {
          const start = Math.max(0, index - 200);
          const end = Math.min(content.length, index + 400);
          const excerpt = doc.content_text.substring(start, end);
          
          relevantSections.push({
            filename: doc.filename,
            content: excerpt,
            score
          });
        }
      }
    });

    if (relevantSections.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: `I couldn't find any relevant information about "${query}" in your uploaded documents. Try rephrasing your question or upload more documents.` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sort by relevance
    relevantSections.sort((a, b) => b.score - a.score);
    const topSections = relevantSections.slice(0, 3);

    // Use AI to summarize and answer
    const contextForAI = topSections.map((section, i) => 
      `[Document: ${section.filename}]\n${section.content}`
    ).join('\n\n---\n\n');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are Maria, a helpful document assistant. Answer the user's question based ONLY on the provided document excerpts. If the answer isn't in the excerpts, say so. Always cite which document the information came from. Keep responses concise (max 200 words).`
          },
          {
            role: 'user',
            content: `Documents:\n${contextForAI}\n\nQuestion: ${query}`
          }
        ],
        max_tokens: 500
      })
    });

    if (!aiResponse.ok) {
      throw new Error('AI summarization failed');
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices[0]?.message?.content || 'Unable to generate answer';

    const citations = topSections.map(s => `📄 ${s.filename}`).join('\n');
    const message = `${answer}\n\n**Sources:**\n${citations}`;

    return new Response(
      JSON.stringify({ message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Document Q&A error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to query documents',
        message: "Sorry, I couldn't search your documents right now. Please try again."
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
