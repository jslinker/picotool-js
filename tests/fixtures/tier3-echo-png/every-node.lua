
-- title comment
-- author comment
-- the code with the nodes
-- doesn't have to make sense

function f(arg1, ...)
  local zzz = {}
  zzz[arg1] = 999
  zzz['extra'] = ...
  return zzz
end

local function myprint(msg)
  print(msg)
end

a = 1
f(a, a+1 , a + 2 )
beta, gamma = 2, 3

do
  gamma = 4
  break
end

while a < 10 do
  -- increase a
  a += 1
  if a % 2 == 0 then
    f(a)
  elseif a > 5 then
    f(a, 5)
  else
    f(a, 1)
    beta *= 2
  end
end

repeat
  -- reduce a
  a -= 1
  f(a)
until a <= 0

for a=3, 10, 2 do
    f(a)
end

for beta in vals() do
      f(beta)
end

if a < 20 then
  goto mylabel
end
a = -20 + 2 - .1
gamma = 9.999e-3
::mylabel::

if (a * 10 > 100) myprint('yup')

prefix = 'foo'
mytable = {
  [prefix..'key'] = 111,
  barkey= 222;
  333
}

a=1; b=2; c=3

if ((x < 1) or (x > width) or (y < 1) or (y > height)) then
  return 0
end

::draw::
goto draw

