# AI Learning Canvas
## Final Product Specification

**Product:** AI Learning Canvas
**Category:** AI-powered interactive education
**Primary audience:** University students and independent learners
**Hackathon track:** Education
**Primary interface:** Infinite, hand-drawn AI teaching canvas
**Interaction:** Natural voice, text, and direct whiteboard manipulation
**Product status:** Defined product direction; LLM-driven drawing already implemented

---

# 1. Executive Summary

AI Learning Canvas is a conversational AI teaching environment that transforms educational material into personalized, interactive lessons conducted on an infinite digital whiteboard.

A student can upload a research paper, textbook, lecture presentation, source-code example, or other academic material—or simply request an explanation of a topic.

The AI interprets the learning objective, plans a coherent lesson, and teaches through natural conversation while progressively drawing explanations, equations, diagrams, and illustrations directly onto the whiteboard.

Unlike traditional educational chatbots, the platform does not treat the whiteboard as a secondary visualization panel. The whiteboard is the central environment in which the lesson takes place.

The AI acts like an instructor standing at a board: introducing ideas, developing diagrams, writing equations, annotating earlier explanations, moving between topics, and responding to questions as they arise.

The student can interrupt naturally, ask about specific drawings, modify the whiteboard, explore interactive explanations, and return to previously covered material.

All learning artifacts remain spatially organized and persistent, allowing the whiteboard to become a continuously evolving record of the student's understanding.

## Core Value Proposition

**An AI teacher that can teach virtually anything, start to finish, on a living, interactive whiteboard.**

The product combines four essential capabilities:

1. **Intelligent teaching:** The AI plans and conducts a coherent lesson rather than simply answering isolated questions.
2. **LLM-driven drawing:** The teacher directly draws, writes, annotates, and modifies visual explanations instead of assembling conventional UI components.
3. **Natural interaction:** Students can interrupt, ask follow-up questions, and manipulate explanations without losing the lesson's context.
4. **Persistent spatial learning:** Everything taught remains accessible on an infinite whiteboard that the AI and student can revisit and extend.

The primary objective is to recreate the experience of having an excellent personal teacher explaining difficult ideas on a shared whiteboard.

---

# 2. Product Vision and Philosophy

## 2.1 The Teacher Is the Product

The defining experience is the quality of the teaching interaction.

Students should feel that the AI is conducting a real lesson, not reading generated content aloud.

The tutor must be able to:

- Understand what the student wants to learn.
- Interpret educational material.
- Identify important ideas and prerequisites.
- Decide how to structure an explanation.
- Teach progressively rather than presenting everything at once.
- Choose visual explanations when appropriate.
- Ask or answer questions naturally.
- Recognize when a concept requires clarification.
- Adapt the depth and pace of an explanation.
- Return to the planned lesson after interruptions.
- Maintain continuity throughout an extended learning session.

The system should not require students to repeatedly prompt the AI to continue teaching.

A lesson is an ongoing activity managed by the tutor.

## 2.2 The Whiteboard Is the Primary Interface

The whiteboard is not a conventional diagram editor, slideshow, or collection of predefined visualization widgets.

It is a continuous teaching surface.

The AI should freely create handwritten explanations, equations, diagrams, arrows, illustrations, and annotations in the same way a human instructor would use a digital pen.

The whiteboard must support both deliberate teaching sequences and spontaneous explanations.

The visual experience should feel organic, continuous, and uncluttered.

## 2.3 Drawing Is the Default Visual Language

**LLM-generated hand-drawn content is the primary rendering method for educational explanations.**

The AI should determine what to draw, where to draw it, how to organize the explanation, and how to develop it progressively.

The system should avoid forcing visual explanations into rigid cards, predefined diagrams, or dashboard-like components.

This applies to:

- Concept diagrams
- Mathematical derivations
- Graphs and networks
- Flowcharts
- System architectures
- Annotated source material
- Code walkthroughs
- Comparisons
- Visual metaphors
- Timelines
- Scientific illustrations

The existing LLM-driven drawing implementation is the foundation for this capability.

Future development should extend that system rather than replace it with a competing component-generation architecture.

## 2.4 The Student Shares the Whiteboard

The whiteboard belongs to both the student and the teacher.

The tutor can create and modify explanations, while the student can freely explore, annotate, move, and interact with the content.

The AI must maintain awareness of the current whiteboard state and respond to student actions where supported.

This makes the experience collaborative rather than purely observational.

## 2.5 Teaching Takes Priority Over Features

Not every concept needs an animation, simulation, interactive control, or quiz.

Sometimes a carefully drawn diagram and a clear explanation are sufficient.

The tutor should select the simplest effective teaching approach.

The objective is understanding, not maximizing the number of generated visual elements.

---

# 3. Target Audience and Use Cases

## 3.1 Primary Audience

The primary audience consists of university students studying complex academic subjects.

Initial subject priorities include:

- Computer science
- Mathematics
- Machine learning and AI
- Physics
- Engineering
- Statistics
- Data structures and algorithms
- Computer networks
- Databases
- Technical research papers

The underlying teaching engine should remain subject-independent, although advanced interactive behavior may initially be limited to supported technical domains.

## 3.2 Secondary Audiences

**Independent learners:** People teaching themselves unfamiliar subjects.

**Graduate students and researchers:** People attempting to understand complex papers, methodologies, and technical systems.

**Instructors and teaching assistants:** People seeking reusable visual explanations or interactive teaching environments.

## 3.3 Core Use Cases

### UC-01 — Learn a Topic from Scratch

A student asks the AI to teach an unfamiliar subject.

The tutor identifies the important concepts, establishes an appropriate starting point, and teaches the subject through a progressively developed whiteboard lesson.

### UC-02 — Learn from Uploaded Materials

A student uploads a textbook chapter, lecture presentation, or research paper.

The tutor uses the material to construct a lesson that explains the content rather than merely summarizing it.

### UC-03 — Understand a Difficult Concept

A student identifies something they do not understand.

The tutor develops a focused explanation using examples, drawings, equations, and relevant prerequisite knowledge.

### UC-04 — Learn a Research Paper from Start to Finish

A student uploads an academic paper and requests a complete explanation.

The tutor introduces relevant background knowledge, explains the research problem, walks through the methodology, interprets important equations and figures, and discusses the results.

### UC-05 — Ask Questions During a Lesson

A student interrupts an ongoing explanation.

The tutor stops, understands the question in context, answers using the existing whiteboard, and resumes the lesson when appropriate.

### UC-06 — Explore a Drawing

A student points to an equation, diagram, arrow, or annotation and asks about it.

The tutor identifies the relevant content and provides a contextual explanation.

### UC-07 — Request a Different Explanation

A student asks the tutor to simplify an explanation, introduce an analogy, show another example, or approach a problem mathematically.

The tutor changes its explanation without restarting the lesson.

### UC-08 — Interact with a Visual Explanation

A student changes a parameter, moves part of a diagram, or steps through a process.

The tutor observes the interaction and explains the result.

### UC-09 — Solve a Problem with Guidance

The student works through a problem while the tutor provides hints, visual explanations, and feedback.

The tutor should favor helping the student reason through the problem rather than immediately revealing the solution.

### UC-10 — Revisit Previous Material

The student asks to return to an earlier explanation.

The tutor navigates to the existing drawings and resumes discussing them.

### UC-11 — Continue an Existing Lesson

The student closes the application and returns later.

The workspace restores the lesson, drawings, annotations, and relevant learning context.

---

# 4. End-to-End Learning Experience

## Phase 1 — Starting a Lesson

The student opens the application and encounters a clean whiteboard accompanied by a minimal AI interaction interface.

The student may:

- Enter a topic.
- Upload educational material.
- Open a saved lesson.
- Resume an unfinished session.

The student should not need to configure an elaborate workflow before learning.

Example:

"Teach me backpropagation. I understand neural networks, but I'm weak at calculus."

The system interprets the request and begins preparing an appropriate lesson.

## Phase 2 — Lesson Planning

The tutor identifies:

- The primary learning objective.
- Relevant background knowledge.
- Major concepts.
- Conceptual dependencies.
- Important equations and examples.
- Opportunities for visual explanation.
- A logical teaching sequence.

The system produces an internal lesson plan.

The student may see a concise outline, but the plan should remain flexible.

The tutor should not require the student to approve every lesson step.

## Phase 3 — Beginning the Explanation

The tutor starts speaking or writing while progressively drawing on the canvas.

For example, when introducing neural networks, it might:

1. Write the topic heading.
2. Draw a simple neuron.
3. Explain inputs and weights.
4. Extend the diagram into a network.
5. Introduce the mathematical expression.
6. Draw arrows illustrating information flow.
7. Highlight the relevant portions while speaking.

The explanation unfolds naturally instead of displaying a completed slide.

## Phase 4 — Responding to Student Questions

The student interrupts:

"Wait, why are we multiplying by the weights?"

The tutor should:

1. Stop the current spoken explanation.
2. Pause the active drawing sequence.
3. Preserve the current lesson state.
4. Identify the relevant elements on the canvas.
5. Explain the purpose of weighted inputs.
6. Add annotations or modify the existing drawing.
7. Determine whether to continue or address another question.

The tutor must not treat the interruption as a completely new lesson.

## Phase 5 — Interactive Exploration

When useful, the tutor can introduce interaction into the existing drawing.

For example, a neural network connection may become adjustable.

The student changes its weight.

The corresponding mathematical behavior is recomputed, and the teacher can redraw or update relevant portions of the explanation.

The visual appearance should remain consistent with the handwritten whiteboard.

The interaction should not suddenly transform the lesson into an unrelated dashboard.

## Phase 6 — Maintaining Lesson Continuity

The tutor moves between concepts while preserving spatial context.

If a previous explanation becomes relevant, the tutor can navigate back to it.

New material may be placed beside or below related material.

The AI should understand the relationship between different regions of the canvas and avoid repeatedly recreating the same explanation.

## Phase 7 — Reviewing the Lesson

At suitable points, the tutor may:

- Summarize important concepts.
- Revisit key diagrams.
- Ask a comprehension question.
- Work through another example.
- Allow the student to solve a problem independently.
- Address unresolved questions.

These interactions should complement teaching rather than interrupt it unnecessarily.

## Phase 8 — Saving and Returning

The application preserves the whiteboard, source materials, lesson structure, and relevant conversation context.

The student can return to the workspace and continue from where they stopped.

---

# 5. Infinite Whiteboard System

## 5.1 Canvas Navigation

The canvas must support:

- Infinite or effectively unbounded 2D navigation.
- Smooth mouse and trackpad panning.
- Pinch-to-zoom.
- Cursor-aware zoom.
- Object selection.
- Multiselection.
- Object movement.
- Drawing-group transformations.
- Undo and redo.
- Fit-to-content.
- Focus-on-selection.
- AI-directed viewport navigation.
- Persistent object coordinates.
- Persistent viewport state.

The canvas should remain responsive as the workspace grows.

## 5.2 LLM-Driven Drawing Engine

The drawing engine is the primary visual output mechanism.

The AI produces drawing instructions that the canvas interprets and renders.

The existing implementation should support or be extended toward:

### Freehand Strokes

- Lines
- Curves
- Arbitrary paths
- Sketches
- Highlights
- Underlines
- Circles
- Freeform annotations

### Handwritten Content

- Explanatory text
- Labels
- Mathematical symbols
- Equations
- Derivations
- Numbered steps
- Short code examples

### Diagram Construction

- Nodes
- Edges
- Arrows
- Flowcharts
- Architecture diagrams
- Graphs
- Timelines
- Scientific illustrations
- Conceptual representations

### Drawing Modification

- Add to an existing drawing.
- Extend a diagram.
- Erase specific strokes.
- Modify a drawing.
- Redraw part of an explanation.
- Highlight existing content.
- Move or transform drawing groups.
- Connect previously drawn elements.

The AI should have enough freedom to construct explanations that are not restricted to predefined templates.

## 5.3 Progressive Drawing

Drawings should appear in a logical teaching sequence.

The tutor should not generate an entire completed whiteboard and reveal it all at once unless doing so is appropriate.

For example, a derivation should be developed progressively, with each step appearing when it becomes relevant.

Progressive drawing should feel natural and purposeful.

The application should avoid artificial delays that make the student wait for unnecessarily slow handwriting animations.

## 5.4 Semantic Drawing Structure

Although the visual output is hand-drawn, the underlying system should preserve useful structure.

Where feasible, related strokes should be grouped into meaningful entities.

Examples:

- A neuron and its label.
- A graph node.
- A connecting edge.
- A mathematical expression.
- A diagram section.
- A handwritten note.

Each group may retain:

- A stable identifier.
- Its coordinates and bounds.
- Its purpose in the lesson.
- Associated concepts.
- Source references.
- Related drawing groups.
- Whether it was created by the AI or the student.

This allows the tutor to refer to existing content without regenerating it.

The system should not require perfect semantic recognition of every individual stroke. It should preserve structure at a useful level of granularity.

## 5.5 Spatial Memory

The teaching engine should maintain awareness of previously created drawings.

For example:

"The network diagram we made earlier."

"The equation in the upper-right corner."

"The example below the graph."

These references should resolve to existing whiteboard content when possible.

Spatial memory should include object identity, location, relevant concepts, and lesson context.

## 5.6 Whiteboard Organization

The AI should organize drawings in a readable spatial layout.

Guidelines include:

- Leave appropriate spacing between explanations.
- Avoid overlapping unrelated content.
- Group related concepts visually.
- Position follow-up explanations near relevant material.
- Use arrows and annotations to show relationships.
- Maintain consistent visual scale.
- Avoid unnecessarily expanding across the canvas.
- Preserve earlier material when introducing new sections.

The whiteboard should feel naturally organized rather than algorithmically packed.

## 5.7 Student Drawing and Annotation

The student should be able to:

- Draw freehand.
- Highlight information.
- Add handwritten or typed notes.
- Circle important content.
- Connect existing drawings.
- Move supported objects.
- Erase their own work.
- Select drawings for discussion.

The tutor should respect student-created content.

AI modifications to student-owned content should require appropriate authorization or be limited to non-destructive annotations.

## 5.8 Teacher Focus and Camera Behavior

The AI should be able to focus the student's view on relevant whiteboard regions.

Expected behaviors include:

- Panning to the current explanation.
- Zooming to important details.
- Returning to previous drawings.
- Framing related concepts together.
- Highlighting the currently discussed region.

Students must retain control.

If the student pans away, the tutor should not continuously force the camera back without an obvious reason.

A follow-teacher mode may be supported, with the ability to explore independently and return to the active explanation.

---

# 6. Visual Teaching Intelligence

## 6.1 Purpose

Visual teaching intelligence determines how the AI should communicate an idea visually.

The teaching system determines what needs to be explained.

The drawing system determines how to represent it on the whiteboard.

These responsibilities should be coordinated but conceptually distinct.

## 6.2 Choosing a Visual Explanation

The tutor should select a representation based on the subject and learning objective.

Examples:

| Subject | Drawing approach |
|---|---|
| Algorithms | Hand-drawn arrays, graphs, execution traces, arrows |
| Calculus | Written equations, function curves, tangent lines |
| Neural networks | Sketched neurons, connections, weights, gradients |
| Computer networks | Packet flow diagrams, network nodes, protocols |
| Databases | Hand-drawn tables, relationships, query walkthroughs |
| Physics | Force diagrams, motion trajectories, annotated equations |
| Research papers | Simplified figures, methodology diagrams, equation walkthroughs |

These are examples, not restrictions on what the drawing engine may produce.

## 6.3 Visual Development

The tutor should be able to develop an explanation incrementally.

Examples:

- Draw a basic graph, then add edge weights.
- Write an equation, then annotate individual terms.
- Draw a system architecture, then reveal its data flow.
- Sketch a physical system, then add force vectors.
- Construct a timeline, then connect related events.

The result should resemble a live whiteboard lesson.

## 6.4 Visual Consistency

The system should maintain consistent visual conventions.

Related concepts should use recognizable labels, colors, and drawing styles.

Important elements should remain legible.

The tutor should avoid unnecessary decorative elements or excessive visual complexity.

The hand-drawn aesthetic should improve clarity rather than imitate messy handwriting.

## 6.5 Visual Reuse

The AI should be able to reuse existing drawings.

For example, an earlier neural network diagram can be extended when introducing backpropagation.

A previous function graph can be annotated when introducing derivatives.

The system should prefer modifying existing work when that helps preserve context.

## 6.6 Animation

The primary animation language is the progressive appearance and modification of drawings.

Appropriate animations include:

- Strokes appearing in sequence.
- Arrows being drawn.
- Diagram sections being extended.
- Equations being transformed.
- Highlights moving between relevant objects.
- Data flow progressing through a sketch.
- Controlled camera movement.

Animations should be interruptible and should not unnecessarily delay the lesson.

---

# 7. Interactive Hand-Drawn Explanations

## 7.1 Interaction Philosophy

Interaction should be embedded into the hand-drawn teaching environment.

The product should not rely primarily on conventional UI widgets for educational demonstrations.

Students should feel like they are manipulating the teacher's drawings.

For example:

- Dragging a point on a hand-drawn graph.
- Changing a weight on a sketched neural network.
- Moving nodes in a graph.
- Adjusting a variable in a handwritten equation.
- Stepping through a hand-drawn algorithm.
- Rearranging elements of a diagram.

The visual representation remains consistent with the whiteboard even when the underlying behavior is structured.

## 7.2 Interactive Drawing Model

An interactive drawing may consist of:

1. A hand-drawn visual representation.
2. An underlying semantic object or model.
3. A set of permitted interactions.
4. State associated with those interactions.
5. A mechanism for recomputing or updating relevant behavior.

The student interacts with the drawing.

The system updates the underlying state.

The drawing engine renders the resulting changes.

## 7.3 Optional Interactivity

Not every drawing must be interactive.

Simple sketches, labels, equations, and illustrations should remain lightweight when interaction provides no additional educational value.

The tutor determines whether an interactive demonstration is appropriate.

## 7.4 Supported Interaction Categories

### Mathematical Interaction

- Adjustable variables.
- Interactive function graphs.
- Geometric manipulation.
- Parameter-driven equations.
- Stepwise calculations.

### Algorithmic Interaction

- Graph manipulation.
- Array updates.
- Execution stepping.
- State inspection.
- Algorithm input changes.

### Diagram Interaction

- Node selection.
- Moving connected objects.
- Editing relationships.
- Highlighting paths.
- Exploring component dependencies.

### Experimental Interaction

- Changing parameters.
- Running supported simulations.
- Comparing outcomes.
- Resetting examples.
- Replaying processes.

## 7.5 Deterministic Behavior

Functional demonstrations must use appropriate calculation or execution engines.

The LLM should not invent computational results.

For example, a mathematical graph should reflect actual evaluated functions.

An algorithm visualizer should represent the real algorithm's state transitions.

The hand-drawn representation should remain synchronized with the computed state.

## 7.6 Interaction Limitations

If the system cannot reliably make a drawing interactive, it should preserve the teaching experience through another representation.

For example, the tutor may draw several states of a process rather than generating an unsupported simulation.

The system should not present a decorative animation as an executable experiment.

---

# 8. AI Teaching Engine

## 8.1 Core Responsibilities

The teaching engine manages the educational experience.

Its responsibilities include:

- Understanding learning objectives.
- Interpreting student knowledge and preferences.
- Analyzing uploaded materials.
- Identifying prerequisites.
- Planning lessons.
- Generating explanations.
- Determining when to draw.
- Coordinating spoken and visual teaching.
- Responding to questions.
- Managing lesson state.
- Maintaining continuity.
- Adapting explanations.
- Completing lesson segments.

## 8.2 Lesson Planning

The tutor should construct a teaching plan based on conceptual relationships.

A plan may contain:

- Introduction
- Motivation
- Background concepts
- Prerequisites
- Core explanation
- Worked examples
- Mathematical detail
- Practical applications
- Limitations
- Review

The plan should guide the lesson without becoming a rigid script.

## 8.3 Incremental Instruction

The tutor should generate and deliver instruction incrementally.

It should not be necessary to generate the complete lesson before beginning.

A typical teaching segment includes:

- A learning objective.
- Spoken or written explanation.
- Relevant whiteboard drawing actions.
- Optional student interaction.
- A transition to the next concept.

This supports natural interruptions and changes in direction.

## 8.4 Adaptive Teaching

The student should be able to request:

- Simpler explanations.
- More advanced explanations.
- Mathematical derivations.
- Intuitive analogies.
- Practical examples.
- Visual demonstrations.
- Slower pacing.
- Faster progression.
- Repetition.
- A return to prerequisites.

The tutor should adjust without discarding the existing lesson.

## 8.5 Handling Digressions

Students frequently ask questions that temporarily depart from the planned material.

The tutor should preserve:

- The current lesson objective.
- The point at which the digression occurred.
- The reason for the digression.
- Relevant whiteboard objects.
- The next planned explanation.

Once the question has been addressed, the tutor should be able to resume naturally.

## 8.6 Contextual Whiteboard Understanding

The AI should understand the current teaching environment.

This includes:

- Existing drawings.
- Associated concepts.
- Current selection.
- Recent visual actions.
- Student annotations.
- Active interactive objects.
- Current viewport context.
- Previously referenced explanations.

This information allows the tutor to answer questions such as:

"What does this arrow mean?"

"Why did you cross that out?"

"Can you use the example from earlier?"

## 8.7 Student Understanding

The tutor should make reasonable adjustments based on:

- Explicit student statements.
- Follow-up questions.
- Requested clarifications.
- Responses to practice questions.
- Observable interactions with learning materials.

The system should avoid assuming that completing a lesson proves mastery.

Detailed learning analytics are not necessary for the core teaching experience.

---

# 9. Conversational Voice System

## 9.1 Voice as a Primary Interaction

The product should support natural spoken conversation.

Students should be able to ask questions without repeatedly clicking buttons or managing individual audio recordings.

The experience should resemble a real conversation with an instructor.

## 9.2 Voice Capabilities

The system should support:

- Speech recognition.
- Spoken explanations.
- Streaming audio.
- Natural interruptions.
- Follow-up questions.
- Context-aware commands.
- Switching between voice and text.
- Clear feedback about speaking and listening state.

## 9.3 Interruption Handling

When a student interrupts:

1. The system detects the interruption.
2. Current speech playback stops.
3. Stale queued audio is canceled.
4. Related drawing actions pause or complete safely.
5. The current lesson position is preserved.
6. The student request is processed.
7. The tutor answers in context.
8. Teaching resumes when appropriate.

The system must avoid continuing an obsolete drawing sequence after the student has redirected the lesson.

## 9.4 Speech and Drawing Synchronization

The teacher's speech should align with the whiteboard.

When introducing a new concept, the drawing should appear as the concept is explained.

When referencing an existing drawing, the relevant region should be highlighted or brought into focus.

Synchronization should be coordinated through teaching events rather than relying entirely on post-processing generated speech.

## 9.5 Voice Quality

The tutor's voice should prioritize:

- Naturalness
- Clarity
- Intelligibility
- Comfortable pacing
- Expressive but restrained delivery
- Suitability for extended educational explanations

## 9.6 Voice Backend

The architecture should support modular speech services.

The preferred approach is a local or locally hosted speech pipeline where practical.

Potential technologies include:

- Local voice activity detection.
- Local speech-to-text.
- A language-model teaching orchestrator.
- Streaming text-to-speech.
- WebRTC-based browser communication.

Qwen-based TTS remains a candidate, but the system should not be tied permanently to one voice engine.

## 9.7 Text Fallback

All essential learning functionality must remain usable through text.

Voice failures should not make the whiteboard or lesson inaccessible.

---

# 10. Learning Material Ingestion

## 10.1 Supported Sources

Initial priority:

- PDFs
- Presentation slides
- Plain text
- Markdown
- Source code

Future support:

- Word documents
- Spreadsheets
- Images
- Audio recordings
- Transcripts
- Additional educational formats

## 10.2 Source Processing

Imported material should be processed into structured, searchable information.

Where possible, preserve:

- Filename
- Page number
- Slide number
- Section
- Text segment
- Figure reference
- Equation
- Table
- Code location
- Timestamp

## 10.3 Source-Based Lesson Generation

The tutor should identify important concepts, relationships, examples, and explanations from the material.

It should then construct a teaching sequence rather than simply repeating the source content.

## 10.4 Source Grounding

When teaching from imported material, the system should preserve relevant references.

Students should be able to inspect the original source behind an explanation.

The AI must distinguish:

- Content explicitly present in the source.
- Interpretations derived from the source.
- Supplementary explanations.
- AI-generated examples.

## 10.5 Source Reader

The application should offer a collapsible source reader.

Students can open the relevant document and navigate to the passage or figure associated with the current explanation.

The source reader should support the lesson rather than replace the whiteboard as the primary interface.

---

# 11. Spatial Memory and Knowledge Structure

## 11.1 Purpose

The system should preserve enough structured context to understand how concepts, sources, and whiteboard drawings relate.

The knowledge structure supports teaching continuity.

It is not intended to become a full research claim-analysis platform.

## 11.2 Concept Relationships

The system may maintain relationships such as:

- Prerequisite of
- Example of
- Application of
- Related to
- Derived from
- Explained by

These relationships help determine teaching order and locate relevant prior explanations.

## 11.3 Drawing Relationships

A drawing or drawing group may be associated with:

- A concept.
- A lesson section.
- A source passage.
- Another drawing.
- An interactive model.
- A student question.
- A previous explanation.

## 11.4 Persistent Lesson Context

The system should preserve:

- Current topic.
- Current lesson section.
- Concepts already covered.
- Important student questions.
- Areas requiring clarification.
- Relevant drawings.
- Previous digressions.
- Pending teaching steps.

## 11.5 Optional Concept Map

Students may eventually access a visual map of concepts and their relationships.

However, the concept map should remain secondary.

The central learning experience is the whiteboard lesson.

---

# 12. User Interface and Visual Design

## 12.1 Design Direction

The application should feel like a premium digital learning environment.

Its interface should be:

- Minimal
- Calm
- Responsive
- Readable
- Intuitive
- Visually consistent
- Focused on the lesson

The product should avoid a generic AI dashboard aesthetic.

## 12.2 Primary Layout

The main interface consists of:

### Infinite Whiteboard

Occupies most of the screen.

Contains the tutor's drawings, student annotations, and interactive explanations.

### AI Companion

A compact interaction surface for:

- Speaking
- Typing
- Viewing conversation state
- Pausing or resuming
- Issuing contextual commands

### Source Panel

Provides access to uploaded learning materials and relevant citations.

### Lesson Navigation

Offers lightweight access to:

- Current lesson
- Lesson outline
- Previous sections
- Saved sessions

### Drawing Controls

Provides essential tools for:

- Selection
- Panning
- Drawing
- Highlighting
- Erasing
- Undo and redo

## 12.3 Whiteboard Visual Style

Educational content should appear hand-drawn.

The system should prioritize:

- Legible handwriting.
- Clear mathematical notation.
- Natural arrows and connectors.
- Consistent annotation colors.
- Comfortable spacing.
- Progressive visual construction.
- Minimal unnecessary borders or containers.

Hand-drawn content should feel deliberate and polished, not artificially messy.

## 12.4 Focus and Attention

The tutor should guide visual attention through:

- Highlighting.
- Underlining.
- Circling.
- Drawing arrows.
- Temporary emphasis.
- Camera movement.
- Progressive revelation.

The tutor should avoid excessive movement or unrelated visual effects.

## 12.5 Responsive Layout

Desktop browsers are the initial priority.

Tablet support is desirable, especially for drawing and annotation.

Mobile support may initially focus on viewing lessons and conversational interaction rather than full whiteboard editing.

---

# 13. Persistence and Workspace Management

## 13.1 Local-First Workspace

The application should preserve learning materials and workspace state locally where practical.

Locally saved content should remain accessible independently of optional remote services.

## 13.2 Persisted State

The system should preserve:

- Uploaded sources.
- Extracted material.
- Lesson plans.
- Drawing strokes.
- Drawing groups.
- Spatial coordinates.
- Viewport state.
- Student annotations.
- Interactive model configurations.
- Relevant conversation history.
- Lesson progress.
- Concept relationships.

## 13.3 Session Restoration

Students should be able to reopen the application and return to the same whiteboard state.

The tutor should have sufficient saved context to resume the lesson coherently.

## 13.4 Workspace Export

The application should support exporting and restoring workspace data.

A structured export should preserve relevant drawing information, object relationships, positions, and lesson metadata.

Portable exports should clearly indicate whether original source files are included.

## 13.5 Failure Recovery

The application should protect completed work against ordinary reloads and interruptions.

Long sessions should preserve recoverable state.

---

# 14. Technical Architecture

## 14.1 Architectural Overview

The product should separate teaching reasoning, drawing execution, interaction state, voice processing, and persistence.

### A. Browser Application

Responsible for:

- Infinite canvas rendering.
- User input.
- Drawing interaction.
- Viewport management.
- Source reading.
- Audio capture and playback.
- Local persistence.

### B. Source Processing Service

Responsible for:

- File ingestion.
- Content extraction.
- Segmentation.
- Source metadata.
- Retrieval.
- Citation resolution.

### C. Teaching Orchestrator

Responsible for:

- Lesson planning.
- Conversation state.
- Student intent.
- Teaching progression.
- Tool selection.
- Model requests.
- Interruption handling.
- Coordination between drawing and speech.

### D. Language Model

Responsible for:

- Understanding learning objectives.
- Generating explanations.
- Planning lesson segments.
- Selecting drawing operations.
- Interpreting student questions.
- Reasoning about canvas content.
- Producing contextual responses.

### E. Existing LLM Drawing Engine

Responsible for:

- Receiving drawing instructions.
- Rendering strokes and paths.
- Producing handwritten content.
- Constructing diagrams.
- Applying annotations.
- Updating existing drawings.
- Managing drawing groups.
- Supporting progressive rendering.

This is an existing implementation and should be reused.

### F. Canvas State Engine

Responsible for:

- Object and stroke-group identity.
- Coordinate management.
- Selection.
- Transformations.
- Undo and redo.
- State consistency.
- Persistence.
- Viewport synchronization.

### G. Interactive Execution Layer

Responsible for:

- Mathematical calculations.
- Algorithm execution.
- Simulation behavior.
- Interactive state.
- Computed results.
- Synchronization with drawings.

### H. Voice Pipeline

Responsible for:

- Voice activity detection.
- Speech recognition.
- Text-to-speech.
- Streaming audio.
- Interruption handling.
- Audio coordination.

### I. Persistence Layer

Responsible for:

- Local source storage.
- Workspace state.
- Drawing history.
- Lesson context.
- Saved sessions.
- Export and restoration.

## 14.2 Teaching and Drawing Pipeline

The intended processing sequence is:

**Student input**

→ Interpret intent and current lesson context

→ Retrieve relevant materials and whiteboard references

→ Determine the next teaching action

→ Generate explanation and drawing instructions

→ Validate drawing operations

→ Execute drawing actions progressively

→ Coordinate speech and visual output

→ Observe student interactions

→ Update lesson state

→ Continue teaching

The system should be capable of streaming lesson output rather than waiting for an entire lesson to be generated.

## 14.3 Drawing Action Interface

The LLM should interact with the existing drawing engine through its supported instruction format.

Conceptual capabilities include:

- DRAW_STROKE
- DRAW_PATH
- WRITE_TEXT
- WRITE_EQUATION
- DRAW_ARROW
- ANNOTATE
- HIGHLIGHT
- ERASE
- MODIFY_DRAWING
- GROUP_DRAWINGS
- TRANSFORM_DRAWING
- FOCUS_VIEWPORT
- BIND_INTERACTION

These are conceptual operations rather than a requirement to replace the current drawing API.

The implementation should adapt them to the existing engine.

## 14.4 Semantic Drawing References

Where feasible, generated drawings should receive stable identifiers or group references.

The tutor should be able to identify and manipulate relevant drawing regions during future interactions.

For example:

- Highlight the previously drawn neuron.
- Extend the network diagram.
- Erase the incorrect equation.
- Return to the earlier graph.
- Annotate the selected arrow.

The goal is sufficient semantic awareness without sacrificing freeform drawing.

## 14.5 Lesson State Machine

The orchestrator should represent teaching activity explicitly.

Potential states include:

- Planning
- Teaching
- Drawing
- Listening
- Answering
- Paused
- Waiting for student interaction
- Reviewing
- Completed

State management must prevent stale speech or drawing operations from continuing after an interruption.

## 14.6 Action Validation

Before executing a drawing or interactive operation, the system should verify:

- The requested action is supported.
- Required parameters are valid.
- Referenced drawings exist.
- The action is permitted.
- Protected student content is respected.
- Interactive behavior is compatible with its underlying model.

Unsupported actions should fail safely.

## 14.7 Model and Tool Independence

The product should avoid tightly coupling its educational behavior to one model or speech service.

The architecture should support replacing:

- The language model.
- Speech recognition.
- Text-to-speech.
- Source extraction engines.
- Specialized calculation tools.

The LLM-driven drawing capability remains the defining visual interface, regardless of the underlying reasoning model.

---

# 15. Reliability, Correctness, and Performance

## 15.1 Teaching Accuracy

The tutor should provide accurate explanations and distinguish uncertain information from established facts.

When demonstrating mathematical or algorithmic behavior, the system should use reliable computation where possible.

## 15.2 Source Reliability

The system should preserve source references and avoid fabricated citations.

Incomplete source extraction should be communicated clearly.

## 15.3 Canvas Consistency

Drawing operations should not unintentionally corrupt previously created content.

Interrupted sequences should leave the canvas in a usable state.

## 15.4 Interaction Reliability

Student inputs should produce predictable results.

Supported interactive demonstrations should remain synchronized with their underlying state.

## 15.5 Voice Reliability

The application should support natural interruption without continuing obsolete audio or drawing sequences.

Text interaction should remain available when voice functionality fails.

## 15.6 Performance

The whiteboard should support:

- Smooth panning and zooming.
- Efficient rendering of large drawings.
- Off-screen drawing culling.
- Responsive selection and annotation.
- Incremental rendering.
- Efficient state updates.
- Stable behavior during long lessons.

Specific performance thresholds should be established through measurement.

## 15.7 User Content Safety

The system should protect student-created notes and drawings.

Potentially destructive AI operations should require authorization or provide a recoverable undo path.

---

# 16. MVP Implementation Scope

The initial product should demonstrate a complete teaching experience rather than an exhaustive collection of features.

## P0 — Essential

### Teaching Engine

- Start a lesson from a topic or document.
- Generate an appropriate lesson plan.
- Teach concepts progressively.
- Answer contextual questions.
- Handle interruptions.
- Resume teaching after digressions.

### Drawing

- Use the existing LLM drawing engine.
- Generate handwritten explanations.
- Draw equations and diagrams.
- Progressively construct visual content.
- Highlight existing drawings.
- Extend and modify previous explanations.
- Maintain stable drawing references where supported.

### Canvas

- Infinite pan and zoom.
- Persistent drawing state.
- Viewport navigation.
- Student object selection.
- Basic student annotations.
- AI-directed focus.

### Voice and Interaction

- Natural spoken conversation.
- Voice interruption.
- Text fallback.
- Synchronization between narration and drawing.
- Contextual questions about the whiteboard.

### Sources

- PDF ingestion.
- Presentation ingestion.
- Basic source retrieval.
- Source-backed explanations.

### Persistence

- Save and restore whiteboard content.
- Preserve lesson state.
- Restore current viewport and drawings.

## P1 — Strong Extensions

- More advanced drawing modification.
- Reliable semantic grouping.
- Rich source citation navigation.
- Interactive hand-drawn diagrams.
- Deterministic algorithm and math demonstrations.
- Improved lesson navigation.
- Multiple-source lessons.
- Concept relationships.
- Workspace export.

## P2 — Future Capabilities

- Broader document support.
- Additional interactive subjects.
- Advanced student progress modeling.
- Collaborative lessons.
- Shareable whiteboards.
- Instructor lesson creation.
- Cross-device synchronization.
- Expanded accessibility.
- Advanced assessment and practice.

---

# 17. Flagship Demonstration

## Scenario: Teaching a Research Paper

A student uploads a technical paper and says:

"Teach me this paper from start to finish. Assume I understand basic machine learning but haven't studied attention mechanisms."

### Step 1 — Interpret the Paper

The tutor identifies the research problem, methodology, key concepts, equations, figures, experiments, and conclusions.

### Step 2 — Plan the Lesson

It creates a teaching sequence that introduces prerequisite concepts before explaining the main contribution.

### Step 3 — Begin Drawing

The tutor starts explaining the paper's motivation while writing and drawing directly on the whiteboard.

It does not generate a static presentation.

### Step 4 — Explain Background Concepts

The tutor draws a simplified attention mechanism, labels its components, and introduces the necessary mathematics.

### Step 5 — Student Interrupts

The student asks:

"Wait, why do we need separate queries and keys?"

The tutor stops its current explanation, highlights the relevant elements, and expands the existing drawing.

### Step 6 — Resume the Paper

After answering, the tutor returns to the planned lesson.

It uses the existing diagrams to explain the architecture proposed by the paper.

### Step 7 — Explain Equations

The tutor progressively writes and annotates the relevant equations.

The student can ask about individual terms and request further derivations.

### Step 8 — Explore an Example

The tutor introduces an interactive or stepwise visual demonstration where useful.

The student explores how the concept behaves.

### Step 9 — Explain Results

The tutor walks through the important experiments and findings, referencing the original figures when necessary.

### Step 10 — Preserve the Lesson

The student finishes with a persistent whiteboard containing the complete visual teaching journey.

The student can revisit any explanation or continue exploring related concepts.

---

# 18. Competitive Positioning

AI Learning Canvas competes with AI tutors, visual learning tools, interactive education platforms, and document-based study assistants.

Its intended distinction is the integration of:

1. Coherent, start-to-finish teaching.
2. Direct LLM-driven handwritten explanations.
3. A persistent infinite whiteboard.
4. Natural conversational interruptions.
5. Shared student and AI interaction.
6. Spatial awareness of previous explanations.
7. Source-grounded lessons.
8. Interactive drawings when appropriate.

The product should not claim that each capability is individually unprecedented.

Its differentiation should come from the quality, fluidity, and completeness of the combined experience.

## Primary Positioning

**A personal AI teacher that thinks, explains, and draws alongside you.**

## Supporting Message

Upload what you're studying or choose a topic, and learn through a real-time lesson that unfolds on an infinite whiteboard.

Interrupt, ask questions, explore drawings, and return to previous explanations as naturally as you would with a human teacher.

---

# 19. Product Boundaries

## Not a Generic Chatbot

The product must conduct lessons rather than primarily generate isolated responses.

## Not a PDF Summarizer

Documents are used to construct educational experiences, not merely produce condensed notes.

## Not a Slide Generator

The whiteboard evolves dynamically through teaching and student interaction.

## Not a UI Component Generator

The primary visual interface is LLM-generated drawing.

Predefined components should not dominate the teaching experience.

## Not a Simulation-First Platform

Simulations are optional teaching tools.

The product should not require every concept to become an executable model.

## Not a Research Management Tool

The main focus is education, not literature discovery or academic evidence investigation.

## Not Primarily a Quiz Platform

Assessment can support learning, but teaching remains the central experience.

## Not a Misconception Debugger

Recognizing and addressing misunderstandings is part of good tutoring, not the defining product category.

---

# 20. Product Success Criteria

## Teaching Quality

- The tutor conducts coherent lessons.
- Explanations build logically.
- The tutor responds appropriately to questions.
- Digressions do not destroy lesson continuity.
- Visual explanations support comprehension.

## Drawing Quality

- Generated drawings are legible.
- Equations and diagrams are understandable.
- Drawing progresses naturally.
- Whiteboard layout remains coherent.
- Previous drawings can be revisited.
- Modifications preserve relevant context.

## Interaction Quality

- Students can interrupt naturally.
- The tutor understands contextual questions.
- Whiteboard navigation is smooth.
- Student annotations remain intact.
- Supported interactions update correctly.

## Reliability

- Lessons can resume after interruptions.
- Workspace state survives ordinary reloads.
- Drawing actions remain consistent.
- Voice failures have text fallbacks.
- Source references remain understandable.

## Learning Value

The system should help students develop a clearer understanding of the subject.

This can be evaluated through feedback, comprehension questions, practical application, and the student's ability to revisit previous explanations.

The product should avoid claiming educational improvement without appropriate evaluation.

---

# 21. Final Product Definition

AI Learning Canvas is an AI-powered interactive learning environment centered on a persistent infinite whiteboard.

Students can upload academic materials or request a topic, and a conversational AI tutor conducts a personalized lesson from beginning to end.

The AI teaches by directly generating handwritten explanations, equations, diagrams, annotations, and illustrations through an existing LLM-driven drawing system.

As the lesson progresses, the tutor can develop new drawings, modify previous explanations, navigate across the canvas, introduce interactive behavior, and respond naturally to student questions.

Students can interrupt, annotate, manipulate supported drawings, revisit earlier material, and continue learning across sessions.

The system combines intelligent lesson orchestration, source-grounded instruction, natural voice interaction, structured spatial memory, and LLM-generated drawing into one continuous teaching experience.

**The fundamental product objective is to make learning complex material feel like sitting beside an excellent teacher who can explain virtually anything on an infinitely flexible whiteboard.**

**Final design principle: The AI teaches by thinking, speaking, and drawing—not by assembling interfaces.**
