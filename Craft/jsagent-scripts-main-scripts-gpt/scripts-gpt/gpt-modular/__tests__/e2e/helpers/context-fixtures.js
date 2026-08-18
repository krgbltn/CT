const getCodePointLength = (value) => Array.from(String(value ?? '')).length

export function singleArticleResponse({
  title = 'Тестовая статья',
  content,
  intentId = 'art-1',
  startIndex = 0,
  endIndex = getCodePointLength(content),
}) {
  return {
    context: [{ doc_id: intentId, title, content, symbol_code: intentId }],
    symbol_code: [intentId],
    start_index: [startIndex],
    end_index: [endIndex],
    title: [title],
  }
}

export function multiRangeArticleResponse({
  title = 'Тестовая статья',
  intentId = 'test-intent-1',
}) {
  return {
    context: [
      {
        doc_id: intentId,
        title,
        content: 'Первый фрагмент статьи с важным маркером.',
        symbol_code: intentId,
      },
      {
        doc_id: intentId,
        title,
        content: 'Второй фрагмент той же статьи.',
        symbol_code: intentId,
      },
    ],
    symbol_code: [intentId, intentId],
    start_index: [0, 20],
    end_index: [10, 30],
    title: [title, title],
  }
}
