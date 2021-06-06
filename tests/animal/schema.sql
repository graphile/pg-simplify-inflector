create table animal (
  id serial primary key
);

create table dog (
  id integer primary key references animal
);
