const OpenAI = require('openai');

class MeetingNotesGenerator {
  constructor(config = {}) {
    this.openai = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY
    });
    this.debug = config.debug || false;
  }

  log(message, data = null) {
    if (this.debug) {
      console.log(`[MeetingNotesGenerator] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  async generateMeetingNotes(transcriptData) {
    if (!this.openai.apiKey || this.openai.apiKey === 'your_openai_api_key_here') {
      this.log('OpenAI API key not configured');
      return { success: false, error: 'OpenAI API key not configured' };
    }

    try {
      // Extract transcript text from the session data
      const transcripts = transcriptData.transcripts || [];
      if (transcripts.length === 0) {
        this.log('No transcripts found in session data');
        return { success: false, error: 'No transcripts found' };
      }

      // Combine all transcript text
      const transcriptText = transcripts
        .map(t => `[${t.speaker}] ${t.text}`)
        .join('\n');

      this.log('Generating meeting notes from transcript', {
        transcriptCount: transcripts.length,
        textLength: transcriptText.length
      });

      // Generate meeting notes
      const notesCompletion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a professional meeting assistant. Generate comprehensive, well-structured meeting notes from the provided transcript. Focus on key points, decisions, action items, and important discussions. Format the notes in a clear, professional manner."
          },
          {
            role: "user",
            content: `Please generate meeting notes from the following transcript:\n\n${transcriptText}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      });

      const meetingNotes = notesCompletion.choices[0].message.content;

      this.log('Meeting notes generated successfully', {
        notesLength: meetingNotes.length
      });

      // Generate todo list
      const todoCompletion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are a meeting assistant that analyzes transcripts to determine follow-up actions. Based on the meeting content, determine if:

1. A meeting reschedule is needed (reschedule_meeting: true/false)
   - Set to true if:  participants requested another meeting , follow-up meeting was explicitly mentioned, meeting was cut short, incomplete discussion,
   - Set to false if: no indication of needing another meeting, meeting was completed successfully or all topics were covered

2. Tasks that need to be created from the meeting discussion

For tasks, generate specific actionable items with:
- task: Clear, actionable task description
- assignee: "TBD" (always use this)
- priority: "high", "medium", or "low" based on urgency
- due_date: "ASAP", "1 week", "2 weeks", "1 month" based on urgency

Respond ONLY with valid JSON in this exact format:
{
  "reschedule_meeting": true/false,
  "tasks": [
    {
      "task": "specific actionable task description",
      "assignee": "TBD",
      "priority": "high/medium/low",
      "due_date": "ASAP/1 week/2 weeks/1 month"
    }
  ]
}`
          },
          {
            role: "user",
            content: `Analyze this meeting transcript and determine follow-up actions:\n\n${transcriptText}`
          }
        ],
        max_tokens: 800,
        temperature: 0.3
      });

      let todoList = {
        reschedule_meeting: false,
        tasks: []
      };

      try {
        const todoResponse = todoCompletion.choices[0].message.content;
        this.log('Raw todo response from OpenAI', todoResponse);
        
        // Parse the JSON response
        const todoData = JSON.parse(todoResponse);
        todoList = {
          reschedule_meeting: todoData.reschedule_meeting || false,
          tasks: todoData.tasks || []
        };
        
        this.log('Todo list generated successfully', todoList);
      } catch (parseError) {
        this.log('Failed to parse todo list JSON, using defaults', parseError.message);
      }

      return {
        success: true,
        meetingNotes: meetingNotes,
        todoList: todoList,
        transcriptCount: transcripts.length,
        sessionId: transcriptData.id,
        duration: transcriptData.duration
      };

    } catch (error) {
      this.log('Failed to generate meeting notes', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = MeetingNotesGenerator;
