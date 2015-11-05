<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

class CreateTablesScript extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('category_order')->unsigned();
            $table->text('name');
            $table->timestamps();
        });

        Schema::create('feeds', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('category_id')->unsigned();
            $table->string('feed_name');
            $table->text('feed_desc')->nullable();
            $table->string('url');
            $table->string('favicon')->nullable();
            $table->timestamps();
        });

        Schema::create('articles', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('feed_id')->unsigned();
            $table->string('status');
            $table->integer('star_ind')->default(0);
            $table->string('url');
            $table->text('subject');
            $table->text('content');
            $table->timestamp('published');
            $table->timestamps();
        });

        // Insert first category
        DB::table('categories')->insert(
            [
                'name' => 'Uncategorised',
                'category_order' => '1',
            ]
        );

        Schema::table('feeds', function (Blueprint $table) {
            $table->foreign('category_id')->references('id')->on('categories');
        });

        Schema::table('articles', function (Blueprint $table) {
            $table->foreign('feed_id')->references('id')->on('feeds');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::drop('articles');
        Schema::drop('feeds');
        Schema::drop('categories');
    }
}
