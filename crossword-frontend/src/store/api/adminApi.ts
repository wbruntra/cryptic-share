import { createApi } from '@reduxjs/toolkit/query/react'
import type { Report, Session } from '../slices/adminSlice'
import type { PuzzleSummary } from '../../types'
import { axiosBaseQuery } from './axiosBaseQuery'

export interface PuzzleDetail {
  id: number
  title: string
  grid: string
  clues: any
  answers: any
}

export interface PuzzleMissingCluesSummary {
  id: number
  title: string
  book?: string
  puzzle_number?: number
}

export const adminApi = createApi({
  reducerPath: 'adminApi',
  baseQuery: axiosBaseQuery({
    baseUrl: '/api/admin/',
  }),
  tagTypes: ['Report', 'Puzzle', 'Session'],
  endpoints: (builder) => ({
    getReports: builder.query<Report[], void>({
      query: () => ({ url: 'reports', method: 'GET' }),
      providesTags: ['Report'],
    }),
    getSessions: builder.query<Session[], void>({
      query: () => ({ url: 'sessions', method: 'GET' }),
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
      query: () => ({ url: '../../api/puzzles', method: 'GET' }),
      providesTags: ['Puzzle'],
    }),
    getPuzzlesMissingClues: builder.query<PuzzleMissingCluesSummary[], void>({
      query: () => ({ url: '../../api/puzzles/missing-clues', method: 'GET' }),
      providesTags: ['Puzzle'],
    }),
    getPuzzleById: builder.query<PuzzleDetail, string>({
      query: (id) => ({ url: `../../api/puzzles/${id}`, method: 'GET' }),
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
  useGetPuzzlesMissingCluesQuery,
  useDeletePuzzleMutation,
  useRenamePuzzleMutation,
  useGetSessionsQuery,
  useDeleteSessionMutation,
  useGetPuzzleByIdQuery,
  useUpdatePuzzleMutation,
} = adminApi
