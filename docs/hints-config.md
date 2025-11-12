# Hint Tutorial Configuration

This file configures the hint tutorial system for first-time users.

## Hint Format

Each hint is defined with the following properties:
- `id`: Unique identifier for the hint
- `title`: Title displayed in the hint
- `description`: Main text content
- `target`: CSS selector for the element to highlight
- `position`: Where to position the hint relative to target (top, bottom, left, right)
- `offsetX`: Horizontal offset in pixels
- `offsetY`: Vertical offset in pixels
- `page`: Which page this hint appears on
- `order`: Display order (1, 2, 3...)
- `showOn`: Device types (desktop, mobile, both)

---

## Chat Hub Hints

### Hint 1: Welcome
- **ID**: `chat-welcome`
- **Title**: Welcome to Aixampapers!
- **Description**: Let's take a quick tour of the main features to help you get started.
- **Target**: `body`
- **Position**: center
- **OffsetX**: 0
- **OffsetY**: 0
- **Page**: chat-hub
- **Order**: 1
- **ShowOn**: both

### Hint 2: Upload Exam Papers
- **ID**: `chat-upload`
- **Title**: Upload Your Exam Papers
- **Description**: Click here to upload exam papers. You can upload PDF files or images of your exams.
- **Target**: `[data-hint="upload-button"]`
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: chat-hub
- **Order**: 2
- **ShowOn**: both

### Hint 3: Today's Study Plan
- **ID**: `chat-study-plan`
- **Title**: Today's Study Sessions
- **Description**: View your scheduled study sessions for today. Click on any session to see details or mark it as complete.
- **Target**: `[data-hint="today-study-plan"]`
- **Position**: left
- **OffsetX**: -10
- **OffsetY**: 0
- **Page**: chat-hub
- **Order**: 3
- **ShowOn**: desktop

### Hint 4: AI Assistant
- **ID**: `chat-assistant`
- **Title**: AI-Powered Help
- **Description**: Ask questions about any topic and get instant explanations. You can also ask for practice questions or study tips.
- **Target**: `[data-hint="chat-input"]`
- **Position**: top
- **OffsetX**: 0
- **OffsetY**: -10
- **Page**: chat-hub
- **Order**: 4
- **ShowOn**: desktop

### Hint 5: New Conversation (Mobile)
- **ID**: `chat-new-conversation-mobile`
- **Title**: Start a New Chat
- **Description**: Tap here to start a new conversation with the AI assistant.
- **Target**: `[data-hint="new-conversation-button"]`
- **Position**: right
- **OffsetX**: 10
- **OffsetY**: 0
- **Page**: chat-hub
- **Order**: 5
- **ShowOn**: mobile

### Hint 6: Question Input (Mobile)
- **ID**: `chat-input-mobile`
- **Title**: Ask Your Question
- **Description**: Type your question here and the AI will help you understand any topic or concept.
- **Target**: `[data-hint="chat-input"]`
- **Position**: top
- **OffsetX**: 0
- **OffsetY**: -10
- **Page**: chat-hub
- **Order**: 6
- **ShowOn**: mobile

### Hint 7: Token Balance
- **ID**: `chat-token-balance`
- **Title**: Your Token Balance
- **Description**: Keep track of your remaining tokens here. Each question uses tokens based on the AI model you've selected.
- **Target**: `[data-hint="token-display"]`
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: chat-hub
- **Order**: 7
- **ShowOn**: both

---

## Exam Viewer Hints

### Hint 8: Exam/Chat Toggle (Year Mode)
- **ID**: `exam-toggle`
- **Title**: Switch Between Views
- **Description**: Toggle between viewing your exam paper and chatting with the AI assistant for help.
- **Target**: `[data-hint="exam-chat-toggle"]`
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: exam-viewer
- **Order**: 1
- **ShowOn**: mobile

### Hint 9: Exam/Chat Toggle (Chapter Mode)
- **ID**: `unified-toggle`
- **Title**: Switch Between Views
- **Description**: Toggle between viewing practice questions and chatting with the AI assistant for help.
- **Target**: `[data-hint="exam-chat-toggle"]`
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: unified-viewer
- **Order**: 1
- **ShowOn**: mobile

---

## Study Plan Hints

### Hint 10: Create Study Plan
- **ID**: `study-plan-create`
- **Title**: Create Your Study Plan
- **Description**: Click here to create a personalized study plan. Choose your subjects, grade level, and study schedule.
- **Target**: `[data-hint="create-plan-button"]`
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: study-plan
- **Order**: 1
- **ShowOn**: both

### Hint 11: Calendar View
- **ID**: `study-plan-calendar`
- **Title**: Your Study Calendar
- **Description**: View all your study sessions in calendar format. Click on any session to view details or update its status.
- **Target**: `[data-hint="calendar-view"]`
- **Position**: top
- **OffsetX**: 0
- **OffsetY**: -10
- **Page**: study-plan
- **Order**: 2
- **ShowOn**: both

### Hint 12: Filter Plans
- **ID**: `study-plan-filter`
- **Title**: Filter Your Plans
- **Description**: Filter study sessions by subject or specific study plan to focus on what matters.
- **Target**: `[data-hint="plan-filter"]`
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: study-plan
- **Order**: 3
- **ShowOn**: both

---

## Profile Settings Hints

### Hint 13: Subscription
- **ID**: `profile-subscription`
- **Title**: Manage Your Subscription
- **Description**: View your current plan, token balance, and upgrade options. Track your usage here.
- **Target**: `[data-hint="subscription-card"]`
- **Position**: right
- **OffsetX**: 10
- **OffsetY**: 0
- **Page**: profile
- **Order**: 1
- **ShowOn**: both

### Hint 14: AI Model Selection
- **ID**: `profile-ai-model`
- **Title**: Choose Your AI Model
- **Description**: Select from different AI models based on your needs. More powerful models use more tokens but provide better results.
- **Target**: `[data-hint="ai-model-select"]`
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: profile
- **Order**: 2
- **ShowOn**: both

---

## Admin Dashboard Hints

### Hint 15: Analytics Overview
- **ID**: `admin-analytics`
- **Title**: System Analytics
- **Description**: Monitor token usage, costs, and user activity across the platform.
- **Target**: `[data-hint="analytics-tab"]`
- **Position**: right
- **OffsetX**: 10
- **OffsetY**: 0
- **Page**: admin
- **Order**: 1
- **ShowOn**: desktop

### Hint 16: AI Model Settings
- **ID**: `admin-ai-models`
- **Title**: Configure AI Models
- **Description**: Manage AI model pricing and availability. Update costs when providers change their pricing.
- **Target**: `[data-hint="ai-model-settings-tab"]`
- **Position**: right
- **OffsetX**: 10
- **OffsetY**: 0
- **Page**: admin
- **Order**: 2
- **ShowOn**: desktop

---

## Notes

- Hints are shown in order based on the **Order** field
- Users can skip or dismiss hints
- Hint progress is saved in localStorage
- Add `data-hint="hint-id"` attribute to target elements in the code
- Positions: top, bottom, left, right, center
- ShowOn: desktop, mobile, both
