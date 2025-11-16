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

  let traceId = 'unknown'; // Default in case JSON parsing fails
  try {
    const parsed = await req.json();
    traceId = parsed.traceId || 'unknown';
    const { intent, userId } = parsed;
    console.log(`[${traceId}] Document Q&A request:`, intent);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const query = intent.query || 'summarize';
    const documentName = intent.documentName || intent.document_name || null;
    const documentId = intent.documentId || null;
    const operation = intent.operation || 'summarize';
    const previousSummary = intent.previousSummary || null;

    // Fetch user's documents
    const { data: documents, error: docsError } = await supabase
      .from('user_documents')
      .select('id, filename, content_text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

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

    // Determine which document to work with
    let targetDoc = null;
    const queryLower = query.toLowerCase();
    
    // If documentId provided (from last_doc), find by ID first
    if (documentId) {
      targetDoc = documents.find(d => d.id === documentId);
      if (targetDoc) {
        console.log(`[${traceId}] ✅ Document found by ID: ${targetDoc.filename}`);
      }
    }
    
    // Fallback to name-based search
    if (!targetDoc && documentName) {
      targetDoc = documents.find(d => d.filename.toLowerCase() === documentName.toLowerCase());
    }
    
    if (!targetDoc) {
      // Extract document name from query (e.g., "summarize NDA.pdf" -> "NDA.pdf")
      const docNameMatch = query.match(/([a-zA-Z0-9_\-\.]+\.(pdf|docx|doc|txt))/i);
      if (docNameMatch) {
        const extractedName = docNameMatch[1];
        targetDoc = documents.find(d => 
          d.filename.toLowerCase().includes(extractedName.toLowerCase()) ||
          extractedName.toLowerCase().includes(d.filename.toLowerCase())
        );
      }
    }
    
    // Fallback: use most recent document if context suggests it
    if (!targetDoc) {
      const recentUpload = documents[0];
      const uploadTime = new Date(recentUpload.created_at);
      const now = new Date();
      const minutesSinceUpload = (now.getTime() - uploadTime.getTime()) / (1000 * 60);
      
      if (minutesSinceUpload < 120) {
        targetDoc = recentUpload;
        console.log(`[${traceId}] ✅ Auto-detected recent document: ${targetDoc.filename} (uploaded ${Math.round(minutesSinceUpload)} min ago)`);
      }
    }

    // If no document identified, do keyword search across all documents
    if (!targetDoc) {
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

      relevantSections.sort((a, b) => b.score - a.score);
      const topSections = relevantSections.slice(0, 3);
      const contextForAI = topSections.map((section, i) => 
        `[Document: ${section.filename}]\n${section.content}`
      ).join('\n\n---\n\n');

      // Use AI to answer based on excerpts
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
              content: `You are Maria, a helpful document assistant. Answer the user's question based ONLY on the provided document excerpts. Keep responses concise (max 200 words).`
            },
            {
              role: 'user',
              content: `Documents:\n${contextForAI}\n\nQuestion: ${query}`
            }
          ],
          max_tokens: 500
        })
      });

      if (!aiResponse.ok) throw new Error('AI failed');
      const aiData = await aiResponse.json();
      const answer = aiData.choices[0]?.message?.content || 'Unable to generate answer';
      const citations = topSections.map(s => `📄 ${s.filename}`).join('\n');
      const message = `${answer}\n\n**Sources:**\n${citations}`;

      return new Response(
        JSON.stringify({ message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // We have a target document - use its FULL content
    console.log(`[${traceId}] Processing document: ${targetDoc.filename} (${targetDoc.content_text.length} chars)`);
    const contextForAI = `[Document: ${targetDoc.filename}]\n\n${targetDoc.content_text}`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Build system prompt based on operation type
    let systemPrompt = `You are Maria, a helpful document assistant. Answer the user's question based ONLY on the provided document content. 

CRITICAL FORMAT RULES:
- Follow the user's format instructions EXACTLY (e.g., "1 line each" means ONE line, not paragraphs)
- If they say "bullet points", use concise bullets (not multi-sentence paragraphs)
- If they specify a number (e.g., "5 bullets"), provide exactly that number
- Do NOT add citations like "(Document: X, Chapter Y)" unless explicitly asked
- Do NOT add extra explanations or context beyond what was requested
- Keep responses focused and concise (max 200 words unless user asks for more)

If the answer isn't in the document, say so clearly.`;
    let userPrompt = `Document content:\n${contextForAI}\n\nUser's request: ${query}`;
    
    if (operation === 'continue_summary') {
      systemPrompt = `You are Maria, a helpful document assistant. The user wants you to CONTINUE a summary that was already started. DO NOT repeat any content from the previous summary. Only add NEW information that comes AFTER what was already covered.`;
      userPrompt = `Previous summary already provided:\n${previousSummary}\n\nFull document:\n${contextForAI}\n\nContinue the summary from where the previous one ended. Do NOT repeat any content already covered. Only provide NEW information.`;
    }
    
    // Add timeout to AI API call to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout (edge functions have 60s limit)
    
    let aiResponse;
    try {
      aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          max_tokens: 1500  // Increased for multi-part queries
        }),
        signal: controller.signal
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error(`[${traceId}] ⏱️ AI API timeout after 55s`);
        throw new Error('AI processing took too long. Please try a simpler question or break it into parts.');
      }
      console.error(`[${traceId}] 🔥 AI API fetch error:`, fetchError);
      throw new Error('AI service temporarily unavailable. Please try again.');
    }
    
    clearTimeout(timeoutId);

    // Handle non-2xx responses
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text().catch(() => 'No error details');
      console.error(`[${traceId}] 🔥 AI API error ${aiResponse.status}:`, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('AI service is busy right now. Please try again in a moment.');
      }
      if (aiResponse.status === 413) {
        throw new Error('This document is too large to process in one go. Try asking about a specific section or page range.');
      }
      throw new Error(`AI processing failed (status ${aiResponse.status}). Please try again.`);
    }

    const aiData = await aiResponse.json().catch(() => null);
    if (!aiData || !aiData.choices || !aiData.choices[0]) {
      console.error(`[${traceId}] 🔥 Invalid AI response structure:`, aiData);
      throw new Error('AI returned invalid response. Please try rephrasing your question.');
    }
    
    const answer = aiData.choices[0]?.message?.content || 'Unable to generate summary';
    
    // CRITICAL: Validate response completeness
    // Check if response is empty, too short, or potentially truncated
    if (!answer || answer.trim().length === 0) {
      console.error(`[${traceId}] 🔥 AI returned empty response`);
      throw new Error('AI returned an empty response. Please try rephrasing your question.');
    }
    
    // For multi-part queries (containing multiple questions), expect substantial content
    const queryText = query.toLowerCase();
    const isMultiPart = (queryText.match(/\band\b/g) || []).length >= 2 || 
                        (queryText.match(/\,/g) || []).length >= 2;
    
    if (isMultiPart && answer.length < 200) {
      console.error(`[${traceId}] 🔥 Response too short for multi-part query: ${answer.length} chars`);
      throw new Error('The response seems incomplete. Try breaking your question into separate parts, or ask me one thing at a time.');
    }
    
    // Check if response was likely truncated (ends mid-sentence without punctuation)
    const lastChar = answer.trim().slice(-1);
    const endsProperlyRough = ['.', '!', '?', ':', ')'].includes(lastChar) || answer.trim().endsWith('...');
    if (!endsProperlyRough && answer.length > 500) {
      console.warn(`[${traceId}] ⚠️ Response may be truncated (ends with: "${lastChar}")`);
      // Don't throw error, but log warning - response might still be useful
    }
    
    // Build the full accumulated summary
    let fullSummary = answer;
    if (operation === 'continue_summary' && previousSummary) {
      fullSummary = `${previousSummary}\n\n${answer}`;
    }
    
    const message = `📄 **${targetDoc.filename}**\n\n${answer}`;

    console.log(`[${traceId}] ✅ Document summary generated successfully (operation: ${operation}, length: ${answer.length} chars)`);

    return new Response(
      JSON.stringify({ 
        message,
        fullSummary // Return the full accumulated summary for storage
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to query documents';
    console.error(`[${traceId}] 🔥 Document Q&A FATAL ERROR:`, errorMsg);
    console.error(`[${traceId}] Stack:`, error instanceof Error ? error.stack : 'No stack');
    
    // GUARANTEE: Always return a user-facing message, never silence
    let userMessage = "Sorry, I hit an issue processing your document question. ";
    
    if (errorMsg.includes('too long') || errorMsg.includes('timeout')) {
      userMessage += "The query took too long - try asking something simpler or break it into parts.";
    } else if (errorMsg.includes('busy') || errorMsg.includes('429')) {
      userMessage += "The AI is busy right now. Please try again in a moment.";
    } else if (errorMsg.includes('too large') || errorMsg.includes('413')) {
      userMessage += "The document is too large. Try asking about a specific section.";
    } else {
      userMessage += "Please try rephrasing your question or try again.";
    }
    
    return new Response(
      JSON.stringify({ 
        message: userMessage,
        error: errorMsg
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
