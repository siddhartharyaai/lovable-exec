import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(supabase: any, userId: string) {
  const { data: tokenData, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (error || !tokenData) {
    throw new Error('Google account not connected');
  }

  const expiresAt = new Date(tokenData.expires_at);
  if (expiresAt <= new Date()) {
    const refreshResult = await supabase.functions.invoke('refresh-google-token', {
      body: { userId }
    });
    
    if (refreshResult.error || !refreshResult.data?.access_token) {
      throw new Error('Failed to refresh token');
    }
    
    return refreshResult.data.access_token;
  }

  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { intent, userId, traceId, action } = await req.json();
    
    console.log(`[${traceId}] Tasks action: ${action}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const accessToken = await getAccessToken(supabase, userId);
    let message = '';

    if (action === 'create') {
      const { title, notes, due } = intent.entities;
      
      // Get default task list
      const listResponse = await fetch(
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!listResponse.ok) {
        const errorBody = await listResponse.text();
        console.error(`[${traceId}] ❌ Google Tasks API error (create action): status=${listResponse.status}`);
        console.error(`[${traceId}] Response body:`, errorBody);
        
        message = `I couldn't create the task (error ${listResponse.status}). `;
        if (listResponse.status === 401 || listResponse.status === 403) {
          message += `Please ensure your Google Tasks account is connected.`;
        }
        
        return new Response(JSON.stringify({ message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const listData = await listResponse.json();
      const defaultList = listData.items?.[0]?.id;

      if (!defaultList) {
        throw new Error('No task list found');
      }

      // Create task
      const taskBody: any = { title };
      if (notes) taskBody.notes = notes;
      if (due) taskBody.due = due;

      const createResponse = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${defaultList}/tasks`,
        {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(taskBody),
        }
      );

      if (!createResponse.ok) {
        throw new Error('Failed to create task');
      }

      message = `✅ Task created: "${title}"`;
      if (due) {
        const dueDate = new Date(due).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
        message += ` (due ${dueDate})`;
      }

    } else if (action === 'complete') {
      const { taskTitle, taskId, taskIndex, completeBoth } = intent.entities;
      
      console.log(`[${traceId}] Complete task: title="${taskTitle}", id="${taskId}", index="${taskIndex}", both="${completeBoth}"`);
      
      // PRIORITY 1: If taskIndex provided, use snapshot
      if (taskIndex !== undefined && taskIndex !== null) {
        const { data: sessionData } = await supabase
          .from('session_state')
          .select('tasks_snapshot')
          .eq('user_id', userId)
          .single();
        
        const snapshot = sessionData?.tasks_snapshot;
        if (!snapshot || !snapshot.list) {
          message = `❌ I don't have a recent task list. Please say "show my tasks" first.`;
          return new Response(JSON.stringify({ message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const taskFromSnapshot = snapshot.list.find((t: any) => t.index === parseInt(taskIndex));
        if (!taskFromSnapshot) {
          message = `❌ I couldn't find task ${taskIndex} in your list. Try "show my tasks" to see current tasks.`;
          return new Response(JSON.stringify({ message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Mark task complete using snapshot data
        const updateResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${taskFromSnapshot.listId}/tasks/${taskFromSnapshot.id}`,
          {
            method: 'PATCH',
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              status: 'completed',
              completed: new Date().toISOString()
            }),
          }
        );

        if (!updateResponse.ok) {
          throw new Error('Failed to complete task');
        }

        message = `✅ Task ${taskFromSnapshot.index} completed: "${taskFromSnapshot.title}"`;
        
        return new Response(JSON.stringify({ message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // PRIORITY 2: Check if we're completing "both" duplicates
      if (completeBoth === true || (typeof taskTitle === 'string' && taskTitle.toLowerCase() === 'both')) {
        // Retrieve disambiguation state from session
        const { data: sessionData } = await supabase
          .from('session_state')
          .select('pending_disambiguation')
          .eq('user_id', userId)
          .single();
        
        const pendingMatches = sessionData?.pending_disambiguation?.matches;
        if (!pendingMatches || pendingMatches.length === 0) {
          message = `❌ I don't have any pending task disambiguation. Please specify the task again.`;
          return new Response(JSON.stringify({ message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        console.log(`[${traceId}] Completing ${pendingMatches.length} duplicate tasks`);
        let completedCount = 0;
        
        for (const match of pendingMatches) {
          const updateResponse = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${match.listId}/tasks/${match.task.id}`,
            {
              method: 'PATCH',
              headers: { 
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                status: 'completed',
                completed: new Date().toISOString()
              }),
            }
          );
          
          if (updateResponse.ok) {
            completedCount++;
          }
        }
        
        // Clear disambiguation state
        await supabase
          .from('session_state')
          .update({ 
            pending_disambiguation: null,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);
        
        message = `✅ Completed ${completedCount} task${completedCount > 1 ? 's' : ''}: "${pendingMatches[0].task.title}"`;
        
        return new Response(JSON.stringify({ message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // PRIORITY 3: Search by title/id (existing logic)
      // Get all task lists
      const listResponse = await fetch(
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!listResponse.ok) {
        const errorBody = await listResponse.text();
        console.error(`[${traceId}] ❌ Google Tasks API error (complete action): status=${listResponse.status}`);
        console.error(`[${traceId}] Response body:`, errorBody);
        
        message = `I couldn't access your tasks to complete it (error ${listResponse.status}). `;
        if (listResponse.status === 401 || listResponse.status === 403) {
          message += `Please ensure your Google Tasks account is connected.`;
        }
        
        return new Response(JSON.stringify({ message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const listData = await listResponse.json();
      const lists = listData.items || [];

      // Search for the task across all lists
      let targetTask: any = null;
      let targetList: string = '';
      const matchingTasks: any[] = [];

      if (taskId) {
        // If taskId provided, search for it
        for (const list of lists) {
          const tasksResponse = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks/${taskId}`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );
          if (tasksResponse.ok) {
            targetTask = await tasksResponse.json();
            targetList = list.id;
            break;
          }
        }
      } else if (taskTitle) {
        // Search by title with intelligent fuzzy matching
        console.log(`[${traceId}] Searching for task: "${taskTitle}"`);
        
        for (const list of lists) {
          const tasksResponse = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );
          const tasksData = await tasksResponse.json();
          const tasks = (tasksData.items || []).filter((t: any) => t.status !== 'completed');
          
          // Find all fuzzy matches
          const matches = tasks.filter((t: any) => {
            const taskLower = t.title.toLowerCase();
            const searchLower = taskTitle.toLowerCase();
            return taskLower.includes(searchLower) || searchLower.includes(taskLower);
          });
          
          matches.forEach((match: any) => {
            matchingTasks.push({ task: match, listId: list.id, listName: list.title });
          });
        }
        
        console.log(`[${traceId}] Found ${matchingTasks.length} matching tasks`);
        
        if (matchingTasks.length === 1) {
          targetTask = matchingTasks[0].task;
          targetList = matchingTasks[0].listId;
        } else if (matchingTasks.length > 1) {
          // Multiple matches - store for disambiguation and ask for clarification
          await supabase
            .from('session_state')
            .upsert({
              user_id: userId,
              pending_disambiguation: {
                action: 'complete_task',
                matches: matchingTasks,
                timestamp: new Date().toISOString()
              },
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id'
            });
          
          message = `📋 I found **${matchingTasks.length} matching tasks** with that name:\n\n`;
          matchingTasks.forEach((item: any, i: number) => {
            message += `${i + 1}. **${item.task.title}**`;
            if (item.task.due) {
              const dueDate = new Date(item.task.due).toLocaleDateString('en-IN', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              });
              message += ` (due ${dueDate})`;
            }
            if (item.listName) {
              message += `\n   _${item.listName}_`;
            }
            message += '\n\n';
          });
          message += `Reply with "1", "2", or "both" to complete them.`;
          
          return new Response(JSON.stringify({ message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      if (!targetTask || !targetList) {
        message = `❌ I couldn't find a task matching "${taskTitle || taskId}". \n\nTry:\n• "Show my tasks" to see what's on your list\n• Being more specific about the task name`;
      } else {
        // Mark task as completed
        const updateResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${targetList}/tasks/${targetTask.id}`,
          {
            method: 'PATCH',
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              status: 'completed',
              completed: new Date().toISOString()
            }),
          }
        );

        if (!updateResponse.ok) {
          throw new Error('Failed to complete task');
        }

        message = `✅ Task completed: "${targetTask.title}"`;
      }

    } else if (action === 'read' || action === 'read_all') {
      const showAll = action === 'read_all' || intent.entities?.show_all === true;
      const showRest = intent.entities?.show_rest === true;
      
      console.log(`[${traceId}] Tasks read action: showAll=${showAll}, showRest=${showRest}`);
      
      // Load existing snapshot + paging from session_state
      const { data: sessionRow } = await supabase
        .from('session_state')
        .select('tasks_snapshot, tasks_paging')
        .eq('user_id', userId)
        .single();
      
      let allTasksSnapshot: any[] = sessionRow?.tasks_snapshot?.list || [];
      let totalTasks = allTasksSnapshot.length;
      let pagingState = sessionRow?.tasks_paging as any | null;
      
      console.log(`[${traceId}] Tasks paging: mode=${showAll ? 'all' : showRest ? 'rest' : 'initial'}, total=${totalTasks}, pagingState=${JSON.stringify(pagingState)}`);
      
      // Only fetch from Google Tasks if no snapshot exists
      if (!allTasksSnapshot || allTasksSnapshot.length === 0) {
        console.log(`[${traceId}] No existing snapshot, fetching tasks from Google Tasks`);
        
        // Get all task lists
        const listResponse = await fetch(
          'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );
  
        if (!listResponse.ok) {
          const errorBody = await listResponse.text();
          console.error(`[${traceId}] ❌ Google Tasks API error: status=${listResponse.status}, url=/users/@me/lists`);
          console.error(`[${traceId}] Response body:`, errorBody);
          
          message = `I couldn't access your tasks right now (error ${listResponse.status}). `;
          if (listResponse.status === 401 || listResponse.status === 403) {
            message += `Please ensure your Google Tasks account is connected and I have permission to access it.`;
          } else {
            message += `Please try again in a moment.`;
          }
          
          return new Response(JSON.stringify({ message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
  
        const listData = await listResponse.json();
        const lists = listData.items || [];
  
        // Fetch all tasks with pagination (up to 50 per list) and deduplicate
        allTasksSnapshot = [];
        const seenTasks = new Set<string>(); // For deduplication: listId|normalizedTitle
        let taskIndex = 1;
        
        for (const list of lists) {
          let pageToken: string | undefined = undefined;
          let tasksInList = 0;
          
          do {
            let url = `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false&maxResults=100`;
            if (pageToken) {
              url += `&pageToken=${pageToken}`;
            }
            
            const tasksResponse = await fetch(url, {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            
            if (!tasksResponse.ok) {
              console.error(`[${traceId}] Failed to fetch tasks for list ${list.id}`);
              break;
            }
            
            const tasksData = await tasksResponse.json();
            const tasks = tasksData.items || [];
            
            tasks.forEach((task: any) => {
              if (tasksInList < 50) { // Cap at 50 tasks per list
                const normalizedKey = `${list.id}|${task.title.trim().toLowerCase()}`;
                if (seenTasks.has(normalizedKey)) {
                  console.log(`[${traceId}] Skipping duplicate task: "${task.title}" in list ${list.title}`);
                  return;
                }
                
                seenTasks.add(normalizedKey);
                allTasksSnapshot.push({
                  index: taskIndex++,
                  id: task.id,
                  listId: list.id,
                  listName: list.title,
                  title: task.title,
                  due: task.due || null,
                  notes: task.notes || null,
                  updated: task.updated || null
                });
                tasksInList++;
              }
            });
            
            pageToken = tasksData.nextPageToken;
            if (tasksInList >= 50) {
              break;
            }
          } while (pageToken);
        }
        
        totalTasks = allTasksSnapshot.length;
        console.log(`[${traceId}] Fetched ${totalTasks} total tasks across ${allTasksSnapshot.length > 0 ? 'lists' : 'no lists'}`);
        
        // Store snapshot in session_state
        await supabase
          .from('session_state')
          .upsert({
            user_id: userId,
            tasks_snapshot: {
              list: allTasksSnapshot,
              timestamp: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });
        
        console.log(`[${traceId}] Stored tasks snapshot in session_state`);
      }
  
      if (totalTasks === 0) {
        message = '✅ No pending tasks. You\'re all caught up!';
      } else {
        // Strictly state-based paging logic
        let displayLimit: number;
        let startIndex: number; // 0-based array index
        
        if (showAll) {
          // SHOW ALL: Always return full list
          startIndex = 0;
          displayLimit = totalTasks;
        } else if (showRest) {
          // SHOW REST: Use paging state to continue from where we left off
          if (pagingState && pagingState.total === totalTasks && pagingState.last_end_index < totalTasks) {
            // Valid paging state: continue from last_end_index
            const nextStart = pagingState.last_end_index + 1; // 1-based index of next task
            startIndex = nextStart - 1; // Convert to 0-based array index
            displayLimit = Math.min(10, totalTasks - startIndex);
          } else {
            // No valid paging state: assume initial view was 1-10, show 11-20
            startIndex = 10;
            displayLimit = Math.min(10, Math.max(0, totalTasks - 10));
          }
        } else {
          // INITIAL VIEW: Always start from beginning
          // Reset paging if previous state was for show_all or if total changed
          if (!pagingState || pagingState.total !== totalTasks || pagingState.last_end_index >= totalTasks) {
            startIndex = 0;
            displayLimit = Math.min(10, totalTasks);
          } else {
            // Valid paging state exists but initial view requested: restart from beginning
            startIndex = 0;
            displayLimit = Math.min(10, totalTasks);
          }
        }
        
        const endIndex = Math.min(startIndex + displayLimit, totalTasks);
        const tasksToShow = allTasksSnapshot.slice(startIndex, endIndex);
        
        console.log(`[${traceId}] Tasks paging slice: startIndex=${startIndex}, endIndex=${endIndex}, tasksToShow=${tasksToShow.length}`);
        
        // Update paging state using 1-based indices from snapshot
        const newPagingState = {
          total: totalTasks,
          last_start_index: tasksToShow.length > 0 ? tasksToShow[0].index : 1,
          last_end_index: tasksToShow.length > 0 ? tasksToShow[tasksToShow.length - 1].index : 0,
          updated_at: new Date().toISOString()
        };
        
        // Only update session_state, preserve snapshot
        await supabase
          .from('session_state')
          .update({
            tasks_paging: newPagingState,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);
        
        console.log(`[${traceId}] Tasks paging updated: last_start_index=${newPagingState.last_start_index}, last_end_index=${newPagingState.last_end_index}, total=${newPagingState.total}`);
  
        // Header depends on view type
        if (showRest) {
          message = `Okay, here are the next ${tasksToShow.length} tasks:\n\n`;
        } else {
          message = `✅ *Your Tasks* (${totalTasks} pending)\n\n`;
        }
  
        // Group by list
        const tasksByList: Record<string, any[]> = {};
        tasksToShow.forEach(task => {
          if (!tasksByList[task.listName]) {
            tasksByList[task.listName] = [];
          }
          tasksByList[task.listName].push(task);
        });
        
        console.log(`[${traceId}] Grouped tasks by list: ${Object.keys(tasksByList).length} lists`);
        
        Object.entries(tasksByList).forEach(([listName, tasks]) => {
          message += `*${listName}*\n`;
          tasks.forEach((task: any) => {
            message += `${task.index}. ${task.title}`;
            if (task.due) {
              const dueDate = new Date(task.due).toLocaleDateString('en-IN', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              });
              message += ` (due ${dueDate})`;
            }
            message += '\n';
          });
          message += '\n';
        });
  
        // Footer logic
        if (showAll) {
          console.log(`[${traceId}] SHOW ALL MODE: No footer`);
        } else if (showRest) {
          if (totalTasks > endIndex) {
            const remaining = totalTasks - endIndex;
            message += `...and ${remaining} more task${remaining > 1 ? 's' : ''}.\n`;
            message += `Reply "show me all tasks" to see the complete list.`;
            console.log(`[${traceId}] SHOW REST MODE: Added footer for ${remaining} remaining tasks`);
          } else {
            console.log(`[${traceId}] SHOW REST MODE: No more tasks, no footer`);
          }
        } else {
          if (totalTasks > displayLimit) {
            const remaining = totalTasks - displayLimit;
            message += `...and ${remaining} more task${remaining > 1 ? 's' : ''}.\n`;
            message += `Reply "show me more" or "show me the rest" to see the next tasks.`;
            console.log(`[${traceId}] INITIAL MODE: Added footer for ${remaining} remaining tasks`);
          } else {
            console.log(`[${traceId}] INITIAL MODE: All tasks shown, no footer`);
          }
        }
      }

    } else if (action === 'update') {
      const { taskTitle, newTitle, newNotes, newDue } = intent.entities;
      
      // Get all task lists
      const listResponse = await fetch(
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!listResponse.ok) {
        throw new Error('Failed to fetch task lists');
      }

      const listData = await listResponse.json();
      const lists = listData.items || [];

      // Search for the task across all lists with intelligent matching
      let targetTask: any = null;
      let targetList: string = '';
      const matchingTasks: any[] = [];
      
      console.log(`[${traceId}] Searching for task: "${taskTitle}"`);

      for (const list of lists) {
        const tasksResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );
        const tasksData = await tasksResponse.json();
        const tasks = (tasksData.items || []).filter((t: any) => t.status !== 'completed');
        
        // Find all fuzzy matches
        const matches = tasks.filter((t: any) => {
          const taskLower = t.title.toLowerCase();
          const searchLower = taskTitle.toLowerCase();
          return taskLower.includes(searchLower) || searchLower.includes(taskLower);
        });
        
        matches.forEach((match: any) => {
          matchingTasks.push({ task: match, listId: list.id, listName: list.title });
        });
      }
      
      console.log(`[${traceId}] Found ${matchingTasks.length} matching tasks`);
      
      if (matchingTasks.length === 1) {
        targetTask = matchingTasks[0].task;
        targetList = matchingTasks[0].listId;
      } else if (matchingTasks.length > 1) {
        // Multiple matches - ask for clarification
        message = `📋 I found **${matchingTasks.length} matching tasks**. Which one did you mean?\n\n`;
        matchingTasks.forEach((item: any, i: number) => {
          message += `${i + 1}. **${item.task.title}**`;
          if (item.task.due) {
            const dueDate = new Date(item.task.due).toLocaleDateString('en-IN', { 
              month: 'short', 
              day: 'numeric' 
            });
            message += ` (due ${dueDate})`;
          }
          message += `\n   List: ${item.listName}\n\n`;
        });
        message += `Please specify which task to update more clearly.`;
        
        return new Response(JSON.stringify({ message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!targetTask || !targetList) {
        message = `❌ I couldn't find a task matching "${taskTitle}". \n\nTry:\n• "Show my tasks" to see what's on your list\n• Being more specific about the task name`;
      } else {
        // Update task
        const updateBody: any = {};
        if (newTitle) updateBody.title = newTitle;
        if (newNotes) updateBody.notes = newNotes;
        if (newDue) updateBody.due = newDue;

        const updateResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${targetList}/tasks/${targetTask.id}`,
          {
            method: 'PATCH',
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateBody),
          }
        );

        if (!updateResponse.ok) {
          throw new Error('Failed to update task');
        }

        message = `✅ Task updated: "${newTitle || targetTask.title}"`;
      }

    } else if (action === 'delete') {
      const { taskTitle } = intent.entities;
      
      // Get all task lists
      const listResponse = await fetch(
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!listResponse.ok) {
        throw new Error('Failed to fetch task lists');
      }

      const listData = await listResponse.json();
      const lists = listData.items || [];

      // Search for the task across all lists with intelligent matching
      let targetTask: any = null;
      let targetList: string = '';
      const matchingTasks: any[] = [];
      
      console.log(`[${traceId}] Searching for task to delete: "${taskTitle}"`);

      for (const list of lists) {
        const tasksResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );
        const tasksData = await tasksResponse.json();
        const tasks = (tasksData.items || []).filter((t: any) => t.status !== 'completed');
        
        // Find all fuzzy matches
        const matches = tasks.filter((t: any) => {
          const taskLower = t.title.toLowerCase();
          const searchLower = taskTitle.toLowerCase();
          return taskLower.includes(searchLower) || searchLower.includes(taskLower);
        });
        
        matches.forEach((match: any) => {
          matchingTasks.push({ task: match, listId: list.id, listName: list.title });
        });
      }
      
      console.log(`[${traceId}] Found ${matchingTasks.length} matching tasks`);
      
      if (matchingTasks.length === 1) {
        targetTask = matchingTasks[0].task;
        targetList = matchingTasks[0].listId;
      } else if (matchingTasks.length > 1) {
        // Multiple matches - ask for clarification
        message = `📋 I found **${matchingTasks.length} matching tasks**. Which one did you want to delete?\n\n`;
        matchingTasks.forEach((item: any, i: number) => {
          message += `${i + 1}. **${item.task.title}**`;
          if (item.task.due) {
            const dueDate = new Date(item.task.due).toLocaleDateString('en-IN', { 
              month: 'short', 
              day: 'numeric' 
            });
            message += ` (due ${dueDate})`;
          }
          message += `\n   List: ${item.listName}\n\n`;
        });
        message += `Please reply with the exact task name to confirm which one to delete.`;
        
        return new Response(JSON.stringify({ message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!targetTask || !targetList) {
        message = `❌ I couldn't find a task matching "${taskTitle}". \n\nTry:\n• "Show my tasks" to see what's on your list\n• Being more specific about the task name`;
      } else {
        // Delete task
        const deleteResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${targetList}/tasks/${targetTask.id}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (!deleteResponse.ok) {
          throw new Error('Failed to delete task');
        }

        message = `🗑️ Task deleted: "${targetTask.title}"`;
      }

    } else {
      message = 'Tasks action not yet implemented';
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in handle-tasks:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      message: `⚠️ Failed to process task request: ${errorMessage}` 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});