import { createApi } from '@reduxjs/toolkit/query/react'
import type { ClueExplanation } from '../../components/ClueExplanationDisplay'
import { axiosBaseQuery } from './axiosBaseQuery'

export interface ExplanationRequest {
  sessionId: string
  clueNumber: number
  direction: 'across' | 'down'
}

export interface ExplanationResponse {
  success: boolean
  explanation?: ClueExplanation
  cached?: boolean
  processing?: boolean
  requestId?: string
  message?: string
}

export interface ProcessingResponse {
  processing: true
  requestId: string
  message: string
}

export const sessionApi = createApi({
  reducerPath: 'sessionApi',
  baseQuery: axiosBaseQuery({
    baseUrl: '/api/sessions/',
  }),
  tagTypes: ['Explanation'],
  endpoints: (builder) => ({
    // Query for cached explanations only
    getCachedExplanation: builder.query<ClueExplanation | null, ExplanationRequest>({
      query: ({ sessionId, clueNumber, direction }) => ({
        url: `${sessionId}/explain`,
        method: 'POST',
        body: { clueNumber, direction, cachedOnly: true },
      }),
      transformResponse: (response: ExplanationResponse) => {
        if (response.success && response.explanation) {
          return response.explanation
        }
        return null
      },
      transformErrorResponse: (response: any) => {
        // 404 means not cached - return null instead of error
        if (response.status === 404) {
          return null
        }
        return response
      },
      providesTags: (result, error, arg) => [
        { type: 'Explanation', id: `${arg.clueNumber}-${arg.direction}` },
      ],
    }),

    // Mutation to request new explanation (may be async)
    requestExplanation: builder.mutation<ClueExplanation | ProcessingResponse, ExplanationRequest>(
      {
        query: ({ sessionId, clueNumber, direction }) => ({
          url: `${sessionId}/explain`,
          method: 'POST',
          body: { clueNumber, direction },
        }),
        transformResponse: (response: ExplanationResponse) => {
          if (response.processing && response.requestId) {
            return {
              processing: true as const,
              requestId: response.requestId,
              message: response.message || 'Processing...',
            }
          }
          if (response.explanation) {
            return response.explanation
          }
          throw new Error('Invalid response format')
        },
        invalidatesTags: (result, error, arg) => [
          { type: 'Explanation', id: `${arg.clueNumber}-${arg.direction}` },
        ],
      },
    ),

    // Mutation to report an explanation
    reportExplanation: builder.mutation<void, ExplanationRequest & { feedback?: string }>({
      query: ({ sessionId, clueNumber, direction, feedback }) => ({
        url: `${sessionId}/report-explanation`,
        method: 'POST',
        body: { clueNumber, direction, feedback },
      }),
    }),
  }),
})

export const {
  useGetCachedExplanationQuery,
  useRequestExplanationMutation,
  useReportExplanationMutation,
} = sessionApi
