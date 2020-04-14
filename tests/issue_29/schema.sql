create table something(
  something_id integer not null primary key,
  name text
);

create table something_data(
  something_data_id integer not null primary key,
	something_id integer not null references something on delete cascade,
	data text
)
