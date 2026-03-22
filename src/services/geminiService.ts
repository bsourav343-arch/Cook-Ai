import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AnalysisResult {
  detectedIngredients: string[];
  recipes: {
    dishName: string;
    ingredients: string[];
    instructions: string[];
    cookingTime: string;
  }[];
}

export async function analyzeImageAndGenerateRecipes(base64Image: string): Promise<AnalysisResult> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze the uploaded image of food ingredients.
    1. Identify all visible ingredients (vegetables, fruits, proteins, etc.).
    2. Suggest 3 delicious recipes that can be made primarily using these ingredients.
    3. For each recipe, provide:
       - Dish name
       - Full list of ingredients (including common pantry staples)
       - Step-by-step cooking instructions
       - Estimated cooking time
  `;

  const imagePart = {
    inlineData: {
      mimeType: "image/jpeg",
      data: base64Image.split(',')[1] || base64Image,
    },
  };

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [imagePart, { text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detectedIngredients: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of ingredients detected from the image"
          },
          recipes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                dishName: { type: Type.STRING },
                ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
                cookingTime: { type: Type.STRING }
              },
              required: ["dishName", "ingredients", "instructions", "cookingTime"]
            }
          }
        },
        required: ["detectedIngredients", "recipes"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  
  return JSON.parse(text) as AnalysisResult;
}
