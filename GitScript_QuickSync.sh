rm -f .git/index.lock

echo -e "\e[36m========PULL=============\e[0m"
git fetch
git pull

stage=($(git status -s))
if [ ${#stage[@]} -eq 0 ]; then
echo -e "\e[36m====ПРОЕКТ ОБНОВЛЕН=============\e[0m"
else
echo "====Обнаружены измененные файлы===="
git status -s
echo -e "\e[36m========STAGE & COMMIT=============\e[0m"
git add -A 

read -e -p "Обнаружены измененные вами файлы, введите описание коммита и нажмите Enter:" desc 

echo -e "\e[36m======COMMITING & PUSH===========\e[0m"
git commit -m "$desc"
git pull
git push

echo -e "\e[36m=======UNLOCK FILES============\e[0m"

locklist=($(git lfs locks)); 

filepaths=(`printf '%s\n' "${locklist[@]}" | grep '/'`); 

git lfs unlock ${filepaths[@]}

rm -r .git/lfs

echo -e "\e[36m====ЗАЛИТО!=============\e[0m"


exec $SHELL






