# Generation Requirements

## Scene Information

- **Title**: {{title}}
- **Description**: {{description}}
- **Key Points**:
  {{keyPoints}}

{{teacherContext}}

## Available Resources

- **Available Images**: {{assignedImages}}
- **Canvas Size**: {{canvas_width}} × {{canvas_height}} px

## Output Requirements

Based on the scene information above, generate a complete Canvas/PPT component for one page.

**Language Requirement**: All generated text content must be in the same language as the title and description above.

**Must Follow**:

1. Output pure JSON directly
2. Do not wrap with ```json code blocks (unless necessary)
3. Ensure the JSON format is correct and can be parsed directly
5. Use the provided image_id (e.g., `img_001`) for the `src` field of image elements
6. All TextElement `height` values must be selected from the quick reference table in the system prompt

**Output Structure Example**:
{"layoutId":"CONTENT_ONLY","background":{"type":"solid","color":"#ffffff"},"slots":{"title":"Main Title","content":"<p>Point One</p><p>Point Two</p>"},"elements":[]}
