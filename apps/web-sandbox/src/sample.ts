export const SAMPLE_DBML = `Project one_question {
  database_type: 'PostgreSQL'
  Note: 'DBML Canvas sample schema'
}

Table member {
  id bigint [pk, increment]
  email varchar(255) [not null, unique]
  created_at timestamp [not null]
}

Table daily_question {
  id bigint [pk, increment]
  member_id bigint [not null]
  question_date date [not null]
  question_id bigint [not null]

  indexes {
    (member_id, question_date) [unique]
  }
}

Table answer {
  id bigint [pk, increment]
  daily_question_id bigint [not null, unique]
  content text [not null]
  created_at timestamp [not null]
}

Table ai_report {
  id bigint [pk, increment]
  member_id bigint [not null]
  status varchar(30) [not null]
  result text
}

Ref: daily_question.member_id > member.id
Ref: answer.daily_question_id - daily_question.id
Ref: ai_report.member_id > member.id
`;
