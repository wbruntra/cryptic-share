import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { Report, Session } from '../slices/adminSlice'
import { getAuthToken } from '../../services/auth'
import type { PuzzleSummary } from '../../types'

export interface PuzzleDetail {
  id: number
  title: string
  grid: string
  clues: any
  answers: any
}

export const adminApi = createApi({
  reducerPath: 'adminApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/admin/',
    prepareHeaders: (headers) => {
      const token = getAuthToken()
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return headers
    },
  }),
  tagTypes: ['Report', 'Puzzle', 'Session'],
  endpoints: (builder) => ({
    getReports: builder.query<Report[], void>({
      query: () => 'reports',
      providesTags: ['Report'],
    }),
    getSessions: builder.query<Session[], void>({
      query: () => 'sessions',
      providesTags: ['Session'],
    }),
    deleteSession: builder.mutation<string, string>({
      query: (sessionId) => ({
        url: `sessions/${sessionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Session'],
    }),
    getPuzzles: builder.query<PuzzleSummary[], void>({
      query: () => '../../api/puzzles',
      providesTags: ['Puzzle'],
    }),
    getPuzzleById: builder.query<PuzzleDetail, string>({
      query: (id) => `../../api/puzzles/${id}`,
      providesTags: (result, error, id) => [{ type: 'Puzzle', id }],
    }),
    deletePuzzle: builder.mutation<number, number>({
      query: (id) => ({
        url: `../../api/puzzles/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Puzzle'],
    }),
    renamePuzzle: builder.mutation<{ id: number; title: string }, { id: number; title: string }>({
      query: ({ id, title }) => ({
        url: `../../api/puzzles/${id}`,
        method: 'PUT',
        body: { title },
      }),
      invalidatesTags: ['Puzzle'],
    }),
    updatePuzzle: builder.mutation<void, { id: string; data: Partial<PuzzleDetail> }>({
      query: ({ id, data }) => ({
        url: `../../api/puzzles/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Puzzle', id }, 'Puzzle'],
    }),
  }),
})

export const {
  useGetReportsQuery,
  useGetPuzzlesQuery,
  useDeletePuzzleMutation,
  useRenamePuzzleMutation,
  useGetSessionsQuery,
  useDeleteSessionMutation,
  useGetPuzzleByIdQuery,
  useUpdatePuzzleMutation,
} = adminApi
