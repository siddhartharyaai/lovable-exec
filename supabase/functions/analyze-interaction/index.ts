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
    const { 
      interactionId, 
      userId, 
      userMessage, 
      aiResponse, 
      toolsUsed,
      traceId 
    } = await req.json();

    console.log(`[${traceId}] Analyzing interaction for user ${userId}`);

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get recent interaction history for this user
    const { data: recentInteractions } = await supabase
      .from('interaction_feedback')
      .select('user_message, success_score, failure_reason')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Use AI to reflect on the interaction
    const reflectionPrompt = `You are a meta-AI that analyzes AI assistant interactions to improve future performance. Your role is to identify what worked, what didn't, and provide actionable insights.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CURRENT INTERACTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**User Message:** "${userMessage}"
**AI Response:** "${aiResponse}"
**Tools Used:** ${toolsUsed.join(', ') || 'none'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 RECENT INTERACTION HISTORY (Last 5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${(recentInteractions || []).map((i: any, idx: number) => 
  `${idx + 1}. User: "${i.user_message}" - Score: ${i.success_score || 'unknown'} ${i.failure_reason ? `(Failed: ${i.failure_reason})` : ''}`
).join('\n') || 'No recent history'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ANALYSIS TASKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **SUCCESS SCORE (1-5):**
   - 5: Perfect - AI fully understood intent, used correct tools, response was accurate and helpful
   - 4: Good - Minor issues but user likely satisfied
   - 3: Acceptable - Partially met intent, could be better
   - 2: Poor - Significant issues, wrong tools or incomplete response
   - 1: Failed - Completely missed user intent or provided wrong information

2. **FAILURE DETECTION:**
   - Did AI use the wrong tool for the task?
   - Did AI miss using a tool when it should have?
   - Was the response unclear or unhelpful?
   - Did AI hallucinate information instead of using search?
   - Did AI fail to understand user's natural language?
   - Common failures:
     * Using fallback when search_web was needed for current info
     * Not using lookup_contact before adding attendees to calendar
     * Missing multi-action requests (e.g., "check calendar AND email")
     * Poor time parsing (e.g., "tomorrow" → wrong date)
     * Not asking for confirmation on destructive actions

3. **PATTERN DETECTION:**
   - Communication style preferences (formal vs casual, brief vs detailed)
   - Common request types (e.g., frequently asks about specific person's meetings)
   - Time preferences (e.g., prefers morning meetings, specific task categories)
   - Tool usage patterns (e.g., always wants email summary with calendar)

4. **USER PREFERENCES:**
   - Extract concrete preferences like:
     * preferred_meeting_times: "morning" or "afternoon"
     * email_summary_length: "brief" or "detailed"
     * reminder_advance: "30 minutes" or "1 hour"
     * response_style: "casual" or "formal"
   - Only record strong signals, not assumptions

5. **PROMPT IMPROVEMENTS:**
   - If score < 4, suggest a SPECIFIC rule to add to system prompt
   - Format: "When user asks about X, always do Y"
   - Focus on repeatab patterns, not one-off issues
   - Examples:
     * "When user asks about sports scores or match results, ALWAYS use search_web tool first, never answer from memory"
     * "When creating calendar events with a person's name, ALWAYS use lookup_contact first to get their email"
     * "When user mentions 'tomorrow', always clarify morning (9 AM) vs evening (7 PM) if not specified"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 OUTPUT FORMAT (JSON ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Respond with ONLY valid JSON:
{
  "success_score": 1-5,
  "failure_reason": "specific reason if score < 4, or null",
  "detected_patterns": ["pattern1", "pattern2"],
  "user_preferences": {
    "preference_type": "preference_value"
  },
  "prompt_improvements": "specific rule to add OR null"
}

Example outputs:

**Successful interaction:**
{
  "success_score": 5,
  "failure_reason": null,
  "detected_patterns": ["User prefers brief responses", "Frequently checks calendar in the morning"],
  "user_preferences": {
    "response_style": "brief",
    "daily_routine": "morning_calendar_check"
  },
  "prompt_improvements": null
}

**Failed interaction (used wrong tool):**
{
  "success_score": 2,
  "failure_reason": "AI tried to answer sports score from memory instead of using search_web tool for current information",
  "detected_patterns": ["User asks about live sports frequently"],
  "user_preferences": {
    "interest_topics": "sports"
  },
  "prompt_improvements": "When user asks about live sports scores, match results, or current game status, ALWAYS use search_web tool with specific query including sport, teams, and date. Never answer from memory or training data."
}`;

    const reflectionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a meta-AI analyzer. Always respond with valid JSON.' },
          { role: 'user', content: reflectionPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!reflectionResponse.ok) {
      throw new Error('Reflection AI call failed');
    }

    const reflectionData = await reflectionResponse.json();
    let analysis;
    
    try {
      const content = reflectionData.choices[0].message.content;
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      analysis = JSON.parse(jsonStr);
    } catch (e) {
      console.error(`[${traceId}] Failed to parse reflection:`, e);
      analysis = {
        success_score: 3,
        failure_reason: null,
        detected_patterns: [],
        user_preferences: {},
        prompt_improvements: null
      };
    }

    console.log(`[${traceId}] Reflection analysis:`, analysis);

    // Store interaction feedback
    await supabase.from('interaction_feedback').insert({
      user_id: userId,
      interaction_id: interactionId,
      user_message: userMessage,
      ai_response: aiResponse,
      tools_used: toolsUsed,
      success_score: analysis.success_score,
      failure_reason: analysis.failure_reason,
      reflection_analysis: analysis,
    });

    // Update or create learned patterns if score is below 4
    if (analysis.success_score < 4 && analysis.prompt_improvements) {
      const { data: existingPattern } = await supabase
        .from('learned_patterns')
        .select('*')
        .eq('prompt_rule', analysis.prompt_improvements)
        .single();

      if (existingPattern) {
        // Increment frequency
        await supabase
          .from('learned_patterns')
          .update({ 
            frequency: existingPattern.frequency + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingPattern.id);
      } else {
        // Create new pattern
        await supabase.from('learned_patterns').insert({
          pattern_type: 'failure',
          pattern_description: analysis.failure_reason || 'Interaction below success threshold',
          prompt_rule: analysis.prompt_improvements,
          context: { tools_used: toolsUsed, user_message: userMessage },
        });
      }
    }

    // Store successful patterns (score 5)
    if (analysis.success_score === 5 && analysis.detected_patterns.length > 0) {
      for (const pattern of analysis.detected_patterns) {
        const { data: existingPattern } = await supabase
          .from('learned_patterns')
          .select('*')
          .eq('pattern_description', pattern)
          .eq('pattern_type', 'success')
          .single();

        if (existingPattern) {
          await supabase
            .from('learned_patterns')
            .update({ 
              frequency: existingPattern.frequency + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingPattern.id);
        } else {
          await supabase.from('learned_patterns').insert({
            pattern_type: 'success',
            pattern_description: pattern,
            context: { tools_used: toolsUsed },
          });
        }
      }
    }

    // Update user preferences
    for (const [prefType, prefValue] of Object.entries(analysis.user_preferences)) {
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          preference_type: prefType,
          preference_value: { value: prefValue },
          confidence_score: Math.min(1.0, (analysis.success_score / 5.0) * 1.2),
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,preference_type' });
    }

    console.log(`[${traceId}] Interaction analysis complete`);

    return new Response(JSON.stringify({ 
      success: true,
      analysis: analysis
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-interaction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});