import os
import logging
import google.generativeai as genai
from typing import Dict, Any, List
import json

logger = logging.getLogger("itms.ai_service")

class AIService:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key and api_key != "YOUR_GEMINI_API_KEY_HERE":
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel('gemini-1.5-flash')
            self.available = True
        else:
            self.available = False
            logger.warning("Gemini API Key not found or placeholder used. AI features will be disabled.")

    def generate_industrial_report(self, session_data: Dict[str, Any]) -> str:
        if not self.available:
            return "AI Report generation is currently unavailable. Please configure the Gemini API Key."

        prompt = f"""
        You are a Railway Maintenance Consultant. 
        Based on the technical data below, provide 3-5 concise, actionable maintenance suggestions.
        Focus on immediate safety risks (UML) and trend-based preventive actions.
        
        Data Summary:
        {json.dumps(session_data, indent=2)}
        
        Format: Return only a bulleted list of suggestions. No intro or outro.
        """

        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg:
                logger.error(f"Quota Exceeded (429): {error_msg}")
                return "The AI Analysis module has reached its daily/minute quota limit. Please check your Google AI Studio plan or retry in a few minutes. (Note: The rest of your report has been generated successfully below)."
            logger.error(f"Error calling Gemini API: {e}")
            return f"Technical Error in AI module: {error_msg}. (Standard report metrics follow below)."

# Global singleton
ai_service = AIService()
