export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          role: 'admin' | 'student'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role?: 'admin' | 'student'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'admin' | 'student'
          created_at?: string
          updated_at?: string
        }
      }
      subjects: {
        Row: {
          id: string
          name: string
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      grade_levels: {
        Row: {
          id: string
          name: string
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          display_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      exam_papers: {
        Row: {
          id: string
          title: string
          subject_id: string
          grade_level_id: string
          year: number
          syllabus_id: string | null
          pdf_url: string
          pdf_path: string
          uploaded_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          subject_id: string
          grade_level_id: string
          year: number
          syllabus_id?: string | null
          pdf_url: string
          pdf_path: string
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          subject_id?: string
          grade_level_id?: string
          year?: number
          syllabus_id?: string | null
          pdf_url?: string
          pdf_path?: string
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      marking_schemes: {
        Row: {
          id: string
          exam_paper_id: string
          pdf_url: string
          pdf_path: string
          uploaded_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          exam_paper_id: string
          pdf_url: string
          pdf_path: string
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          exam_paper_id?: string
          pdf_url?: string
          pdf_path?: string
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      chat_conversations: {
        Row: {
          id: string
          student_id: string | null
          exam_paper_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_id?: string | null
          exam_paper_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          student_id?: string | null
          exam_paper_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      chat_messages: {
        Row: {
          id: string
          conversation_id: string
          role: 'user' | 'assistant'
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: 'user' | 'assistant'
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: 'user' | 'assistant'
          content?: string
          created_at?: string
        }
      }
      exam_questions: {
        Row: {
          id: string
          exam_paper_id: string
          question_number: string
          page_numbers: number[]
          image_url: string[]
          image_paths: string[]
          ocr_text: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          exam_paper_id: string
          question_number: string
          page_numbers?: number[]
          image_url?: string[]
          ocr_text?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          exam_paper_id?: string
          question_number?: string
          page_numbers?: number[]
          image_url?: string[]
          image_paths?: string[]
          ocr_text?: string
          created_at?: string
          updated_at?: string
        }
      }
      marking_scheme_questions: {
        Row: {
          id: string
          marking_scheme_id: string
          question_number: string
          page_numbers: number[]
          image_url: string[]
          image_paths: string[]
          ocr_text: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          marking_scheme_id: string
          question_number: string
          page_numbers?: number[]
          image_url?: string[]
          image_paths?: string[]
          ocr_text?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          marking_scheme_id?: string
          question_number?: string
          page_numbers?: number[]
          image_url?: string[]
          image_paths?: string[]
          ocr_text?: string
          created_at?: string
          updated_at?: string
        }
      }
      syllabus: {
        Row: {
          id: string
          subject_id: string
          grade_id: string
          file_name: string
          file_url: string
          file_size: number | null
          processing_status: 'pending' | 'processing' | 'completed' | 'failed'
          title: string | null
          description: string | null
          academic_year: string | null
          region: string | null
          extraction_metadata: Json | null
          error_message: string | null
          uploaded_by: string | null
          ai_prompt_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          subject_id: string
          grade_id: string
          file_name: string
          file_url: string
          file_size?: number | null
          processing_status?: 'pending' | 'processing' | 'completed' | 'failed'
          title?: string | null
          description?: string | null
          academic_year?: string | null
          region?: string | null
          extraction_metadata?: Json | null
          error_message?: string | null
          uploaded_by?: string | null
          ai_prompt_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          subject_id?: string
          grade_id?: string
          file_name?: string
          file_url?: string
          file_size?: number | null
          processing_status?: 'pending' | 'processing' | 'completed' | 'failed'
          title?: string | null
          description?: string | null
          academic_year?: string | null
          region?: string | null
          extraction_metadata?: Json | null
          error_message?: string | null
          uploaded_by?: string | null
          ai_prompt_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      syllabus_chapters: {
        Row: {
          id: string
          syllabus_id: string
          chapter_number: number
          chapter_title: string
          chapter_description: string | null
          subtopics: string[]
          display_order: number
          confidence_score: number | null
          is_manually_edited: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          syllabus_id: string
          chapter_number: number
          chapter_title: string
          chapter_description?: string | null
          subtopics?: string[]
          display_order: number
          confidence_score?: number | null
          is_manually_edited?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          syllabus_id?: string
          chapter_number?: number
          chapter_title?: string
          chapter_description?: string | null
          subtopics?: string[]
          display_order?: number
          confidence_score?: number | null
          is_manually_edited?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      question_chapter_tags: {
        Row: {
          id: string
          question_id: string
          chapter_id: string
          confidence_score: number
          is_primary: boolean
          match_reasoning: string | null
          is_manually_set: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          question_id: string
          chapter_id: string
          confidence_score?: number
          is_primary?: boolean
          match_reasoning?: string | null
          is_manually_set?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          question_id?: string
          chapter_id?: string
          confidence_score?: number
          is_primary?: boolean
          match_reasoning?: string | null
          is_manually_set?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
