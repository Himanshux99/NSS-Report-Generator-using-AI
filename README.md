# Report generator

An AI-powered web application designed to automatically draft National Service Scheme (NSS) event activity reports into beautifully structured Microsoft Word (`.docx`) documents.

**Author**: Himanshu Choyal

---

## Key Features

- **Smart WhatsApp Parsing**: Paste unstructured event logs and volunteer lists directly. The application automatically computes attendee counts (Male/Female/Total) and extracts date, time, and venue coordinates.
- **AI-Generated Content**: Automatically builds specific SMART objectives, event narratives, impact summaries, and conclusions using Gemini AI.
- **Custom Gemini API Key Field**: Input your personal Gemini API key directly in the UI to perform API calls under your own quota, or fallback to the default system key.
- **Word Document (.docx) Export**: Download a print-ready Word document with structured tables, customized headers, and signed by the Program Officer.
- **Photo Attachments**: Upload up to 4 event photos that are formatted and embedded directly into the second page of the generated report.

---

## Getting Started

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### 2. Environment Configuration
Create a `.env` file in the root directory and configure your default Gemini API key:
```env
GEMINI_API_KEY=your_default_gemini_api_key_here
```

### 3. Installation
Install the project dependencies:
```bash
npm install
```

### 4. Running the Development Server
Launch the local dev server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## How to Use the Web Application

1. **Step 1: Input Event Details & Objective**
   - **Raw WhatsApp Message**: Paste the unstructured WhatsApp message containing the event outline and the list of attendees.
   - **Major Objective**: Describe the main goal of the event in a single descriptive sentence (up to 500 words).
   - **Administrative Info**: Customize the Scheme, Organizing Unit, or Activity Coordinator if different from defaults.
   - **Gemini API Settings (Optional)**: Provide a custom Gemini API key if you want to bypass the system's quota limits.

2. **Step 2: Generate Draft**
   - Click **Extract & Draft Report**. The app will coordinate with Gemini AI to generate the report sections.

3. **Step 3: Review and Refine**
   - Verify and edit any of the extracted fields (Activity Title, Date, Time, Venue, Volunteers, Objectives, Description, Impact, Conclusion) right in the UI form.
   - (Optional) Upload up to 4 photos from the event.

4. **Step 4: Download Word File**
   - Click **Download Final DOCX** to generate and download the complete report file named in accordance with NSS guidelines.
