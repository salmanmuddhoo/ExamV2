import { supabase } from './supabase';

export interface QuestionData {
  questionNumber: string;
  examImages: string[];
  markingSchemeText: string;
  questionText: string;
}

export function parseQuestionNumber(query: string): string | null {
  const patterns = [
    /(?:question|q|Q\.?)\s*(\d+[a-z]?)/i,
    /(?:^|\s)(\d+[a-z]?)(?:\s|$|\.|\?)/,
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return normalizeQuestionNumber(match[1]);
    }
  }

  const numberWords: { [key: string]: string } = {
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
  };

  for (const [word, number] of Object.entries(numberWords)) {
    if (query.toLowerCase().includes(`question ${word}`)) {
      return number;
    }
  }

  return null;
}

function normalizeQuestionNumber(rawNumber: string): string {
  return rawNumber.trim().toLowerCase().replace(/\s+/g, '');
}

export async function getQuestionImages(
  examPaperId: string,
  questionNumber: string,
  markingSchemeId?: string | null
): Promise<QuestionData | null> {
  try {
    const normalizedQuestionNumber = normalizeQuestionNumber(questionNumber);

    const { data: examQuestion, error: examError } = await supabase
      .from('exam_questions')
      .select('*')
      .eq('exam_paper_id', examPaperId)
      .eq('question_number', normalizedQuestionNumber)
      .maybeSingle();

    if (examError) {
      console.error('Error fetching exam question:', examError);
      return null;
    }

    if (!examQuestion) {
      return null;
    }

    const examImages: string[] = [];

    for (const imagePath of examQuestion.image_paths) {
      const { data, error } = await supabase.storage
        .from('exam-papers')
        .download(imagePath);

      if (error) {
        console.error('Error downloading exam question image:', error);
        continue;
      }

      const arrayBuffer = await data.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      examImages.push(base64);
    }

    return {
      questionNumber: normalizedQuestionNumber,
      examImages,
      markingSchemeText: examQuestion.marking_scheme_text || '',
      questionText: examQuestion.ocr_text || '',
    };
  } catch (error) {
    console.error('Error in getQuestionImages:', error);
    return null;
  }
}

export async function getAllQuestionsForPaper(examPaperId: string): Promise<string[]> {
  try {
    const { data: questions, error } = await supabase
      .from('exam_questions')
      .select('question_number')
      .eq('exam_paper_id', examPaperId)
      .order('question_number');

    if (error) {
      console.error('Error fetching questions:', error);
      return [];
    }

    return questions.map(q => q.question_number);
  } catch (error) {
    console.error('Error in getAllQuestionsForPaper:', error);
    return [];
  }
}
