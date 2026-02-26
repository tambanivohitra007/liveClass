export interface KBArticle {
  id: string;
  title: string;
  body: string;
}

export interface KBCategory {
  id: string;
  title: string;
  articles: KBArticle[];
}

export const knowledgeBase: KBCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    articles: [
      {
        id: 'gs-create-account',
        title: 'Creating your account',
        body: `You can sign up for LiveClass using your email address or Google account.\n\n1. Go to the Sign Up page and enter your details.\n2. Choose your role — Teacher or Student. Teachers require admin approval before accessing all features.\n3. Once approved, you'll be redirected to your dashboard.\n\nIf you signed up with Google, you'll be asked to choose your role on first login.`,
      },
      {
        id: 'gs-roles',
        title: 'Teacher vs Student roles',
        body: `LiveClass has two main roles:\n\nTeachers can create quizzes, host live sessions, create assignments, manage classes, build rubrics, and grade student work.\n\nStudents can join live games via PIN, complete assignments, enroll in classes, and view their results.\n\nYour role is chosen during sign-up and determines which dashboard and features you see.`,
      },
      {
        id: 'gs-navigation',
        title: 'Navigating the dashboard',
        body: `After logging in, you'll land on your dashboard.\n\nTeachers see quick stats (total quizzes, sessions, students) and shortcuts to create quizzes or host games.\n\nStudents see their enrolled classes and recent activity.\n\nUse the sidebar on desktop or the bottom tab bar on mobile to switch between sections like Library, Classes, and Profile.`,
      },
      {
        id: 'gs-profile',
        title: 'Updating your profile',
        body: `Visit the Profile page to update your display name and profile picture.\n\n1. Tap your avatar or go to Profile from the sidebar/tab bar.\n2. Click on your name to edit it.\n3. Upload a new profile photo by clicking the camera icon.\n\nYour display name appears on leaderboards and in class rosters.`,
      },
    ],
  },
  {
    id: 'quizzes',
    title: 'Quizzes',
    articles: [
      {
        id: 'quiz-create',
        title: 'Creating a new quiz',
        body: `1. Go to your Library and click "Create Quiz."\n2. Enter a title and optional description.\n3. Optionally assign the quiz to a collection for organization.\n4. You'll be taken to the Quiz Editor where you can add questions.\n\nQuizzes are saved automatically as you edit them.`,
      },
      {
        id: 'quiz-questions',
        title: 'Adding and editing questions',
        body: `In the Quiz Editor, click "Add Question" to create a new question.\n\nFor each question you can:\n- Write the question text\n- Add an optional image\n- Set 2–4 answer choices and mark the correct one(s)\n- Choose a time limit (10s, 20s, 30s, 45s, 60s, 90s)\n- Set point value\n\nDrag questions to reorder them. Click the trash icon to delete a question.`,
      },
      {
        id: 'quiz-ai-generator',
        title: 'Using the AI question generator',
        body: `The AI generator can create questions for you automatically.\n\n1. In the Quiz Editor, click the "AI Generate" button.\n2. Enter a topic or paste text content.\n3. Choose how many questions to generate.\n4. Review the generated questions and add the ones you like.\n\nYou can edit AI-generated questions just like any other question.`,
      },
      {
        id: 'quiz-collections',
        title: 'Organizing quizzes with collections',
        body: `Collections help you group related quizzes together (e.g., by subject or unit).\n\n1. When creating or editing a quiz, select a collection from the dropdown or create a new one.\n2. View all quizzes in a collection by clicking the collection name in your Library.\n\nCollections make it easy to find quizzes when you have many of them.`,
      },
      {
        id: 'quiz-preview',
        title: 'Previewing and sharing quizzes',
        body: `Before hosting a live session, you can preview your quiz to check how it looks.\n\n1. Open a quiz from your Library.\n2. Click the "Preview" button to see each question as students will see it.\n\nYou can also generate flashcards or a worksheet from any quiz using the toolbar buttons.`,
      },
    ],
  },
  {
    id: 'live-sessions',
    title: 'Live Sessions',
    articles: [
      {
        id: 'live-hosting',
        title: 'Hosting a live session',
        body: `1. Open a quiz from your Library and click "Host Live."\n2. A unique 6-digit PIN is generated for your session.\n3. Share the PIN with your students — they can join at the Join page.\n4. Wait for students to join in the lobby, then start the game.\n\nYou control the pace of the game by advancing through questions.`,
      },
      {
        id: 'live-pin',
        title: 'How PIN codes work',
        body: `Each live session gets a unique 6-digit PIN that students use to join.\n\nThe PIN is displayed on the host screen in large text so you can project it for your class.\n\nPINs expire after the session ends. Each session always gets a fresh PIN so there are no conflicts.`,
      },
      {
        id: 'live-flow',
        title: 'Question flow and pacing',
        body: `During a live session, you control when each question starts:\n\n1. Click "Start Question" to reveal the question to all students.\n2. A countdown timer runs based on the time limit you set.\n3. Students answer in real time on their devices.\n4. When the timer ends (or you click "End Question"), the correct answer is revealed.\n5. Click "Next Question" to advance, or "Show Leaderboard" to display rankings.\n\nYou can end the session at any time to see the final results.`,
      },
      {
        id: 'live-leaderboard',
        title: 'Understanding the leaderboard',
        body: `Points are calculated on the server to prevent cheating:\n\n- Base points: 1000 for a correct answer\n- Speed bonus: Faster answers earn more points (based on time remaining)\n- Streak bonus: +50 points for each consecutive correct answer\n\nThe leaderboard updates after each question. The top 10 players are shown between questions. Final rankings are available in Session Results after the game ends.`,
      },
    ],
  },
  {
    id: 'assignments',
    title: 'Assignments',
    articles: [
      {
        id: 'assign-create',
        title: 'Creating an assignment',
        body: `Assignments let students complete a quiz at their own pace, without a live host.\n\n1. Go to your Library and select a quiz.\n2. Click "Create Assignment."\n3. Set a due date and optionally assign it to a class.\n4. Share the assignment link with students.\n\nStudents can start and pause the assignment anytime before the due date.`,
      },
      {
        id: 'assign-student',
        title: 'How students complete assignments',
        body: `Students access assignments from their dashboard or via a direct link.\n\n1. Open the assignment and click "Start."\n2. Answer each question at your own pace — there's no live timer pressure.\n3. Submit your answers when done.\n\nIf you lose connection, your answers are saved offline and synced when you're back online.`,
      },
      {
        id: 'assign-results',
        title: 'Viewing assignment results',
        body: `Teachers can view assignment results from the Session History page.\n\nThe results show:\n- Each student's score and completion status\n- Per-question breakdown of answers\n- Average score and completion rate\n\nYou can export results as a CSV file for your records.`,
      },
    ],
  },
  {
    id: 'rubrics',
    title: 'Rubrics & Grading',
    articles: [
      {
        id: 'rubric-create',
        title: 'Creating a rubric',
        body: `Rubrics help you grade student work consistently.\n\n1. Go to the Rubrics page and click "Create Rubric."\n2. Give your rubric a title and description.\n3. Add criteria — each criterion has a name, description, and point scale.\n4. Define performance levels (e.g., Excellent, Good, Needs Improvement) with descriptions for each criterion.\n\nRubrics can be reused across multiple grading sessions.`,
      },
      {
        id: 'rubric-ai',
        title: 'Using the AI rubric generator',
        body: `The AI rubric generator creates rubric criteria automatically.\n\n1. In the Rubric Editor, click "AI Generate."\n2. Describe the assignment or learning objectives.\n3. The AI will suggest criteria with performance levels.\n4. Review and customize the generated criteria.\n\nThis saves time when creating rubrics for common assignment types.`,
      },
      {
        id: 'rubric-grading',
        title: 'Grading with a rubric',
        body: `To grade student work using a rubric:\n\n1. Go to Grading and click "New Grading Session."\n2. Select a rubric and a roster of students.\n3. For each student, click on performance levels for each criterion.\n4. Add optional comments per criterion.\n5. The total score is calculated automatically.\n\nResults can be viewed and exported from the Grading Results page.`,
      },
      {
        id: 'rubric-scores',
        title: 'Understanding scores and results',
        body: `Scores are calculated by adding up the points from each criterion's selected performance level.\n\nThe grading results page shows:\n- Individual student scores with detailed breakdowns\n- Class average and score distribution\n- Per-criteria performance overview\n\nYou can export results as a CSV for your grade book.`,
      },
    ],
  },
  {
    id: 'classes',
    title: 'Classes & Rosters',
    articles: [
      {
        id: 'class-create',
        title: 'Creating a classroom',
        body: `Classes help you organize students and share content.\n\n1. Go to Classes and click "Create Class."\n2. Enter a class name and optional description.\n3. A unique join code is generated automatically.\n4. Share the join code with your students.\n\nStudents use the join code to enroll in your class.`,
      },
      {
        id: 'class-join-code',
        title: 'How join codes work',
        body: `Each class has a unique join code that students enter to enroll.\n\n1. Find your class join code on the class detail page.\n2. Share it with students — they can enter it on the Join Class page.\n3. Once joined, students see class assignments and announcements.\n\nYou can regenerate the join code if needed from the class settings.`,
      },
      {
        id: 'class-manage',
        title: 'Managing students in a class',
        body: `On the class detail page, you can see all enrolled students.\n\nFrom here you can:\n- View each student's name and email\n- Remove students from the class\n- See how many students are enrolled\n\nAssignments linked to a class are automatically visible to all enrolled students.`,
      },
      {
        id: 'class-rosters',
        title: 'Using rosters for grading',
        body: `Rosters are separate lists of students used specifically for grading sessions.\n\n1. Go to Rosters and click "Create Roster."\n2. Add student names manually.\n3. When creating a grading session, select a roster to grade.\n\nRosters are useful when you want to grade students who may not have LiveClass accounts.`,
      },
    ],
  },
  {
    id: 'for-students',
    title: 'For Students',
    articles: [
      {
        id: 'student-join',
        title: 'Joining a live game',
        body: `To join a live game:\n\n1. Go to the Join page (tap "Join Game" on mobile or navigate to /join).\n2. Enter the 6-digit PIN your teacher shared.\n3. Choose a nickname.\n4. Wait in the lobby until the teacher starts the game.\n\nMake sure you have a stable internet connection for the best experience.`,
      },
      {
        id: 'student-play',
        title: 'Playing a live game',
        body: `During a live game:\n\n1. Read each question as it appears on your screen.\n2. Tap the answer you think is correct before time runs out.\n3. Faster correct answers earn more points.\n4. Build a streak by answering multiple questions correctly in a row for bonus points.\n\nThe leaderboard shows between questions so you can track your ranking.`,
      },
      {
        id: 'student-results',
        title: 'Viewing your results',
        body: `After a game ends, you'll see your final score and ranking.\n\nYour results include:\n- Total points earned\n- Number of correct answers\n- Your streak record\n- Final leaderboard position\n\nYou can also view past results from your Student Dashboard.`,
      },
      {
        id: 'student-classes',
        title: 'Enrolling in a class',
        body: `To join a class:\n\n1. Get the join code from your teacher.\n2. Go to Join Class from your dashboard or sidebar.\n3. Enter the join code and click "Join."\n\nOnce enrolled, you'll see class assignments on your dashboard. You can leave a class at any time from the class detail page.`,
      },
    ],
  },
];
